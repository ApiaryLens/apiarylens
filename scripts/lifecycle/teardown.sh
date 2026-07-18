#!/bin/sh
# Stop and remove the ApiaryLens deployment. Keep-data is the default:
# containers are removed, data volumes and the target directory remain, and a
# later install over the kept data is supported. Permanent removal requires
# both --delete-data and the typed confirmation flag, mirroring the product's
# deletion-consent rule: consent is never inferred.
#
# Usage: teardown.sh --target DIR --project NAME
#                    [--delete-data --yes-delete-my-data]

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

target=''
project=apiarylens
delete_data=false
confirmed=false
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
    --delete-data)
      delete_data=true
      shift
      ;;
    --yes-delete-my-data)
      confirmed=true
      shift
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$target" ] || al_die 64 "Usage: teardown.sh --target DIR --project NAME [--delete-data --yes-delete-my-data]"
if [ "$delete_data" = "true" ] && [ "$confirmed" != "true" ]; then
  al_die 64 "Permanent removal deletes the database, media, backups, and secrets; re-run with --delete-data --yes-delete-my-data to confirm"
fi

al_require_command docker
current="$target/current"
secrets_dir="$target/secrets"

if [ -f "$current/docker/compose.yaml" ]; then
  if [ "$delete_data" = "true" ]; then
    # Compose requires the secret files to exist to evaluate the project
    # model even while removing it; recreate empty placeholders if the
    # operator already deleted them.
    mkdir -p "$secrets_dir"
    chmod 700 "$secrets_dir"
    for required_secret in "$secrets_dir/bootstrap-token" "$secrets_dir/auth-root"; do
      if [ ! -f "$required_secret" ]; then (
        umask 077
        : >"$required_secret"
      ); fi
    done
    al_compose "$current" down -v
  else
    al_compose "$current" down
  fi
fi

if [ "$delete_data" = "true" ]; then
  rm -rf "$target"/* "$target"/.[!.]* "$target"/..?* 2>/dev/null || true
  rmdir "$target" 2>/dev/null || true
  al_note "ApiaryLens was permanently removed, including data volumes and $target."
else
  al_ledger_append teardown "$(al_json_get "$current/release-identity.json" productVersion)" '' '' '' '' stopped-kept-data
  al_note "ApiaryLens services were stopped and removed; data volumes and $target were kept."
fi
