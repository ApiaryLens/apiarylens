#!/bin/sh
# First install of ApiaryLens from an extracted air-gap bundle, with zero
# network egress: verify bundle -> preflight -> stage -> load images ->
# one-shot migration (network-isolated) -> activate (--no-build, pull_policy
# never) -> health verify -> commit. See docs/AIRGAP.md in the bundle for the
# full transported-update runbook.
#
# Usage:
#   install-airgap.sh --bundle-dir DIR --target DIR [--project NAME]
#     [--site-address ADDR] [--http-port N] [--https-port N] [--backend-only]
#     [--bootstrap-secret-file FILE] [--auth-root-secret-file FILE]

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

bundle_dir=''
target=''
project=apiarylens
site_address=localhost
http_port=80
https_port=443
caddyfile=Caddyfile
bootstrap_file=''
auth_root_file=''
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
    --site-address)
      site_address=$2
      shift 2
      ;;
    --http-port)
      http_port=$2
      shift 2
      ;;
    --https-port)
      https_port=$2
      shift 2
      ;;
    --backend-only)
      caddyfile=Caddyfile.backend-only
      shift
      ;;
    --bootstrap-secret-file)
      bootstrap_file=$2
      shift 2
      ;;
    --auth-root-secret-file)
      auth_root_file=$2
      shift 2
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
{ [ -n "$bundle_dir" ] && [ -n "$target" ]; } ||
  al_die 64 "Usage: install-airgap.sh --bundle-dir DIR --target DIR [--project NAME] [--site-address ADDR] [--http-port N] [--https-port N] [--backend-only] [--bootstrap-secret-file FILE] [--auth-root-secret-file FILE]"

al_require_command docker
al_require_command curl

# 1. Verify the bundle before touching anything.
"$script_dir/verify-bundle.sh" --bundle-dir "$bundle_dir"
manifest="$bundle_dir/bundle-manifest.json"
version=$(al_json_require "$manifest" productVersion)
channel=$(al_json_require "$manifest" channel)
source_commit=$(al_json_require "$manifest" sourceCommit)
build_time=$(al_json_require "$manifest" buildTime)
artifact_identity=$(al_json_require "$manifest" artifactIdentity)
minimum_compose=$(al_json_require "$manifest" minimumComposeVersion)

# 2. Preflight: supported envelope only, no interrupted prior operation.
[ "$(uname -m)" = "x86_64" ] || al_die 69 "Only x86-64 Linux hosts are in the supported envelope"
compose_version=$(docker compose version --short 2>/dev/null) || al_die 69 "Docker Compose v2 plugin is required"
case "$compose_version" in v*) compose_version=${compose_version#v} ;; esac
lowest=$(printf '%s\n%s\n' "$compose_version" "$minimum_compose" | sort -V | head -n 1)
[ "$lowest" = "$minimum_compose" ] ||
  al_die 69 "Docker Compose $compose_version is older than the tested minimum $minimum_compose recorded in the bundle"
[ ! -e "$target/current" ] ||
  al_die 65 "$target already has an active release; use update-airgap.sh for transported updates"

al_prepare_target
al_ledger_require_ready

# 3. Secrets: operator-provided files are moved into place; otherwise
# generated locally from /dev/urandom (no network, no shell history).
secrets_dir="$target/secrets"
if [ -n "$bootstrap_file" ]; then
  [ -s "$bootstrap_file" ] || al_die 64 "Bootstrap secret file is empty: $bootstrap_file"
  mv "$bootstrap_file" "$secrets_dir/bootstrap-token"
elif [ ! -f "$secrets_dir/bootstrap-token" ]; then
  (
    umask 077
    od -An -N 36 -tx1 /dev/urandom | tr -d ' \n' >"$secrets_dir/bootstrap-token"
  )
fi
if [ -n "$auth_root_file" ]; then
  [ -s "$auth_root_file" ] || al_die 64 "Auth root secret file is empty: $auth_root_file"
  if [ -f "$secrets_dir/auth-root" ]; then rm -f "$auth_root_file"; else mv "$auth_root_file" "$secrets_dir/auth-root"; fi
elif [ ! -f "$secrets_dir/auth-root" ]; then
  (
    umask 077
    od -An -N 48 -tx1 /dev/urandom | tr -d ' \n' >"$secrets_dir/auth-root"
  )
fi
# Compose file-backed secrets are bind mounts; the unprivileged container
# user needs read permission while the mode-0700 parent keeps them private.
chmod 644 "$secrets_dir/bootstrap-token" "$secrets_dir/auth-root"

# 4. Stage the release directory from the bundle.
release_dir="$target/releases/$version"
mkdir -p "$release_dir/docker"
cp "$bundle_dir/compose/compose.yaml" "$bundle_dir/compose/compose.airgap.yaml" \
  "$bundle_dir/compose/Caddyfile" "$bundle_dir/compose/Caddyfile.backend-only" "$release_dir/docker/"
cp "$manifest" "$bundle_dir/compatibility-manifest.json" "$bundle_dir/release-identity.json" "$release_dir/"
{
  printf 'APIARYLENS_VERSION=%s\n' "$version"
  printf 'APIARYLENS_SITE_ADDRESS=%s\n' "$site_address"
  printf 'APIARYLENS_HTTP_PORT=%s\n' "$http_port"
  printf 'APIARYLENS_HTTPS_PORT=%s\n' "$https_port"
  printf 'APIARYLENS_BOOTSTRAP_SECRET_FILE=%s\n' "$secrets_dir/bootstrap-token"
  printf 'APIARYLENS_AUTH_ROOT_SECRET_FILE=%s\n' "$secrets_dir/auth-root"
  printf 'APIARYLENS_SOURCE_COMMIT=%s\n' "$source_commit"
  printf 'APIARYLENS_BUILD_TIME=%s\n' "$build_time"
  printf 'APIARYLENS_ARTIFACT_IDENTITY=%s\n' "$artifact_identity"
  printf 'APIARYLENS_CADDYFILE=%s\n' "$caddyfile"
} >"$release_dir/docker/.env"
chmod 600 "$release_dir/docker/.env"

# 5. Load the prebuilt images and verify their identity (no registry access).
"$script_dir/load-images.sh" --bundle-dir "$bundle_dir"

# 6. Dedicated migration step: one-shot, network-isolated, before activation.
al_ledger_append install '' "$version" "$(sha256sum "$manifest" | cut -d' ' -f1)" "$(al_json_require "$manifest" migrationHead)" '' staged
if ! docker run --rm --network none \
  -v "${project}_apiarylens_data:/data" \
  -e APIARYLENS_DATABASE=/data/apiarylens.sqlite \
  "apiarylens-api:$version" node dist/migrate.js; then
  al_ledger_append install '' "$version" '' '' '' migration-failed
  al_die 70 "The one-shot migration failed; no services were started"
fi

# 7. Activate offline: no build, no pull, wait for health checks.
ln -sfn "$release_dir" "$target/current.next"
if ! al_compose "$release_dir" up -d --no-build --wait; then
  rm -f "$target/current.next"
  al_compose "$release_dir" down || true
  al_ledger_append install '' "$version" '' '' '' activation-failed
  al_die 42 "Activation failed; the deployment was stopped"
fi

# 8. Verify the running release identity, then commit.
if ! al_health_verify "https://$site_address:$https_port/health" "$version"; then
  rm -f "$target/current.next"
  al_compose "$release_dir" down || true
  al_ledger_append install '' "$version" '' '' '' verify-failed
  al_die 42 "The deployment started but did not report the expected release identity; it was stopped"
fi
mv -Tf "$target/current.next" "$target/current"
al_ledger_append install '' "$version" '' '' '' committed
al_note "ApiaryLens $version ($channel) is installed, air-gapped, and healthy at https://$site_address:$https_port/."
al_note "The bootstrap token in $secrets_dir/bootstrap-token is the one-time first-owner setup code; delete it after the first owner is created."
