#!/bin/sh
# Create a verified backup of the ApiaryLens data volume (database + media)
# plus the durable secrets and release manifest, using the same stop-copy-
# verify-restart procedure Scout Bee's compose adapter performs. The helper
# image ships inside the air-gap bundle, so no registry access is required.
#
# Usage: backup.sh --target DIR --project NAME [--retention N]
# Prints the backup directory path on success.

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

target=''
project=apiarylens
retention=7
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
    --retention)
      retention=$2
      shift 2
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$target" ] || al_die 64 "Usage: backup.sh --target DIR --project NAME [--retention N]"

al_require_command docker
al_ledger_verify
current="$target/current"
version=$(al_installed_version)
backups="$target/backups"
secrets_dir="$target/secrets"
helper=$(al_helper_image)

mkdir -p "$backups"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backups/$version-$stamp"
mkdir -p "$destination"

if [ -f "$secrets_dir/auth-root" ]; then cp "$secrets_dir/auth-root" "$destination/auth-root"; fi
if [ -f "$current/docker/compose.yaml" ]; then
  al_compose "$current" stop api
  trap 'al_compose "$current" up -d --wait api >/dev/null 2>&1 || true' EXIT
fi
docker run --rm --network none -v "${project}_apiarylens_data:/data:ro" -v "$destination:/backup" \
  "$helper" sh -c 'cd /data && tar czf /backup/data.tar.gz .'
gzip -t "$destination/data.tar.gz"
tar tzf "$destination/data.tar.gz" >/dev/null
for evidence in release-identity.json compatibility-manifest.json bundle-manifest.json; do
  if [ -f "$current/$evidence" ]; then cp "$current/$evidence" "$destination/"; fi
done
find "$backups" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr |
  tail -n "+$((retention + 1))" | cut -d' ' -f2- | while IFS= read -r expired; do
  case "$expired" in "$backups"/*) rm -rf -- "$expired" ;; *) exit 65 ;; esac
done
if [ -f "$current/docker/compose.yaml" ]; then
  al_compose "$current" up -d --wait api
  trap - EXIT
fi

al_ledger_append backup "$version" "$version" '' '' "$destination" completed
printf '%s\n' "$destination"
