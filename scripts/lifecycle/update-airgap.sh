#!/bin/sh
# Transported update of an air-gapped ApiaryLens deployment from an extracted
# bundle, following the shared lifecycle state machine: Discover/Review
# (verify-bundle) -> Preflight -> Back up -> Stage -> Migrate (one-shot,
# network-isolated) -> Activate -> Verify -> Commit or recover. The previous
# release directory and images are retained for rollback.
#
# Usage:
#   update-airgap.sh --bundle-dir DIR --target DIR [--project NAME]
#     [--allow-channel-change] [--force]

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

bundle_dir=''
target=''
project=apiarylens
force=false
allow_channel_change=''
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle-dir)
      bundle_dir=$2
      shift 2
      ;;
    --target)
      target=$2
      shift 2
      ;;
    --project)
      project=$2
      shift 2
      ;;
    --allow-channel-change)
      allow_channel_change=--allow-channel-change
      shift
      ;;
    --force)
      force=true
      shift
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
{ [ -n "$bundle_dir" ] && [ -n "$target" ]; } ||
  al_die 64 "Usage: update-airgap.sh --bundle-dir DIR --target DIR [--project NAME] [--allow-channel-change] [--force]"

al_require_command docker
al_require_command curl

# 1. Discover/Review: bundle integrity plus compatibility with the installed
# version and channel (not-newer, downgrade, minimum-source, channel rules).
"$script_dir/verify-bundle.sh" --bundle-dir "$bundle_dir" --target "$target" $allow_channel_change
manifest="$bundle_dir/bundle-manifest.json"
version=$(al_json_require "$manifest" productVersion)
migration_head=$(al_json_require "$manifest" migrationHead)
source_commit=$(al_json_require "$manifest" sourceCommit)
build_time=$(al_json_require "$manifest" buildTime)
artifact_identity=$(al_json_require "$manifest" artifactIdentity)
minimum_compose=$(al_json_require "$manifest" minimumComposeVersion)
headroom_gib=$(al_json_require "$manifest" requiredDiskHeadroomGiB)
bundle_digest=$(sha256sum "$manifest" | cut -d' ' -f1)

current_dir=$(al_current_release_dir)
from_version=$(al_installed_version)

# 2. Preflight: envelope, ledger readiness, disk headroom.
[ "$(uname -m)" = "x86_64" ] || al_die 69 "Only x86-64 Linux hosts are in the supported envelope"
compose_version=$(docker compose version --short 2>/dev/null) || al_die 69 "Docker Compose v2 plugin is required"
case "$compose_version" in v*) compose_version=${compose_version#v} ;; esac
lowest=$(printf '%s\n%s\n' "$compose_version" "$minimum_compose" | sort -V | head -n 1)
[ "$lowest" = "$minimum_compose" ] ||
  al_die 69 "Docker Compose $compose_version is older than the tested minimum $minimum_compose recorded in the bundle"
al_ledger_require_ready
available_kib=$(df -Pk "$target" | awk 'NR==2 {print $4}')
required_kib=$((headroom_gib * 1024 * 1024))
if [ "$available_kib" -lt "$required_kib" ] && [ "$force" != "true" ]; then
  al_die 69 "Only $((available_kib / 1024 / 1024)) GiB free under $target but the bundle requires $headroom_gib GiB headroom (images + retained rollback release + one backup); free space or re-run with --force"
fi

# 3. Back up before mutation (lifecycle contract: forced, verified).
backup_path=$("$script_dir/backup.sh" --target "$target" --project "$project" | tail -n 1)
al_note "Pre-update backup verified at $backup_path"

# 4. Stage the new release directory; configuration carries over.
release_dir="$target/releases/$version"
mkdir -p "$release_dir/docker"
cp "$bundle_dir/compose/compose.yaml" "$bundle_dir/compose/compose.airgap.yaml" \
  "$bundle_dir/compose/Caddyfile" "$bundle_dir/compose/Caddyfile.backend-only" "$release_dir/docker/"
cp "$manifest" "$bundle_dir/compatibility-manifest.json" "$bundle_dir/release-identity.json" "$release_dir/"
sed -e "s|^APIARYLENS_VERSION=.*|APIARYLENS_VERSION=$version|" \
  -e "s|^APIARYLENS_SOURCE_COMMIT=.*|APIARYLENS_SOURCE_COMMIT=$source_commit|" \
  -e "s|^APIARYLENS_BUILD_TIME=.*|APIARYLENS_BUILD_TIME=$build_time|" \
  -e "s|^APIARYLENS_ARTIFACT_IDENTITY=.*|APIARYLENS_ARTIFACT_IDENTITY=$artifact_identity|" \
  "$current_dir/docker/.env" >"$release_dir/docker/.env"
chmod 600 "$release_dir/docker/.env"
al_ledger_append update "$from_version" "$version" "$bundle_digest" "$migration_head" "$backup_path" staged

# 5. Load the new images and verify their identity (no registry access).
"$script_dir/load-images.sh" --bundle-dir "$bundle_dir"

# 6. Migrate: dedicated observable step before any service is recreated. The
# running api is stopped first so the one-shot container has exclusive use of
# the database; on failure the previous release is simply restarted and the
# data volume remains restorable from the step-3 backup.
al_compose "$current_dir" stop api
if ! docker run --rm --network none \
  -v "${project}_apiarylens_data:/data" \
  -e APIARYLENS_DATABASE=/data/apiarylens.sqlite \
  "apiarylens-api:$version" node dist/migrate.js; then
  al_compose "$current_dir" up -d --wait api || true
  al_ledger_append update "$from_version" "$version" "$bundle_digest" "$migration_head" "$backup_path" migration-failed
  al_die 70 "The one-shot migration failed; the previous release was restarted untouched. Recover with restore.sh --backup $backup_path if the database was left mid-migration"
fi

# 7. Activate the new release; on failure re-activate the previous one.
ln -sfn "$release_dir" "$target/current.next"
if ! al_compose "$release_dir" up -d --no-build --wait; then
  rm -f "$target/current.next"
  al_compose "$current_dir" up -d --wait || true
  al_ledger_append update "$from_version" "$version" "$bundle_digest" "$migration_head" "$backup_path" rolled-back
  al_die 42 "Activation of $version failed; $from_version was re-activated. If the migration was schema-incompatible, restore from $backup_path"
fi

# 8. Verify the running release identity; on failure roll back.
site_address=$(sed -n 's/^APIARYLENS_SITE_ADDRESS=//p' "$release_dir/docker/.env" | head -n 1)
https_port=$(sed -n 's/^APIARYLENS_HTTPS_PORT=//p' "$release_dir/docker/.env" | head -n 1)
if ! al_health_verify "https://${site_address:-localhost}:${https_port:-443}/health" "$version"; then
  rm -f "$target/current.next"
  al_compose "$current_dir" up -d --wait || true
  al_ledger_append update "$from_version" "$version" "$bundle_digest" "$migration_head" "$backup_path" rolled-back
  al_die 42 "$version started but did not report the expected release identity; $from_version was re-activated. If the migration was schema-incompatible, restore from $backup_path"
fi

# 9. Commit; retain the previous release and images for the rollback window.
mv -Tf "$target/current.next" "$target/current"
al_ledger_append update "$from_version" "$version" "$bundle_digest" "$migration_head" "$backup_path" committed
al_note "ApiaryLens $version is active and healthy; $from_version remains retained under $target/releases for rollback."
