#!/bin/sh
# Re-activate the retained previous release. Rollback is allowed only while
# the applied database migration head is unchanged from what the previous
# release shipped (ADR 0021 rollback constraint); otherwise the safe path is
# restore.sh from the pre-update backup.
#
# Usage: rollback.sh --target DIR --project NAME [--to VERSION] [--force]

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

target=''
project=apiarylens
to_version=''
force=false
while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      target=$2
      shift 2
      ;;
    --project)
      project=$2
      shift 2
      ;;
    --to)
      to_version=$2
      shift 2
      ;;
    --force)
      force=true
      shift
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$target" ] || al_die 64 "Usage: rollback.sh --target DIR --project NAME [--to VERSION] [--force]"

al_require_command docker
al_ledger_require_ready
current_dir=$(al_current_release_dir)
current_version=$(al_installed_version)

if [ -z "$to_version" ]; then
  for candidate in "$target/releases"/*/; do
    [ -d "$candidate" ] || continue
    candidate_version=$(basename "$candidate")
    [ "$candidate_version" = "$current_version" ] && continue
    if [ "$(al_compare_versions "$candidate_version" "$current_version")" = "lt" ]; then
      if [ -z "$to_version" ] || [ "$(al_compare_versions "$candidate_version" "$to_version")" = "gt" ]; then
        to_version=$candidate_version
      fi
    fi
  done
fi
[ -n "$to_version" ] || al_die 65 "No retained previous release to roll back to under $target/releases"
release_dir="$target/releases/$to_version"
[ -d "$release_dir" ] || al_die 65 "Release $to_version is not retained under $target/releases"
[ -f "$release_dir/docker/.env" ] || al_die 65 "Release $to_version has no staged configuration to re-activate"

# Compatibility gate: the previous release's shipped migration head must equal
# the head currently applied to the data volume.
previous_head=$(al_release_migration_head "$release_dir")
[ -n "$previous_head" ] ||
  al_die 65 "Release $to_version records no migration head; rollback compatibility cannot be proven — restore from a verified backup instead"
applied_head=$(al_migration_head_of_volume "apiarylens-api:$current_version")
[ -n "$applied_head" ] || al_die 65 "The applied migration head could not be read from the data volume"
if [ "$applied_head" != "$previous_head" ]; then
  al_die 65 "Rollback refused: the data volume is at migration head $applied_head but $to_version shipped head $previous_head; use restore.sh with the pre-update backup instead"
fi

al_note "Rolling back from $current_version to $to_version (migration head $applied_head unchanged)."
ln -sfn "$release_dir" "$target/current.next"
if ! al_compose "$release_dir" up -d --wait; then
  rm -f "$target/current.next"
  al_compose "$current_dir" up -d --wait || true
  al_ledger_append rollback "$current_version" "$to_version" '' "$applied_head" '' rollback-failed
  al_die 42 "Re-activating $to_version failed; the previous release was restarted"
fi

site_address=$(sed -n 's/^APIARYLENS_SITE_ADDRESS=//p' "$release_dir/docker/.env" | head -n 1)
https_port=$(sed -n 's/^APIARYLENS_HTTPS_PORT=//p' "$release_dir/docker/.env" | head -n 1)
if ! al_health_verify "https://${site_address:-localhost}:${https_port:-443}/health" "$to_version"; then
  rm -f "$target/current.next"
  al_compose "$current_dir" up -d --wait || true
  al_ledger_append rollback "$current_version" "$to_version" '' "$applied_head" '' rollback-failed
  al_die 42 "$to_version restarted but failed health verification; the previous release was re-activated"
fi

mv -Tf "$target/current.next" "$target/current"
al_ledger_append rollback "$current_version" "$to_version" '' "$applied_head" '' rolled-back
al_note "ApiaryLens $to_version is active again and health verification passed."
