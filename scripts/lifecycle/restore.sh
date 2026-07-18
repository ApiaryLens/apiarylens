#!/bin/sh
# Restore the newest (or a named) verified backup into the data volume. This
# is destructive: it replaces the live database and media, revokes every
# session (as Scout Bee's restore does), and restarts the deployment.
#
# Usage: restore.sh --target DIR --project NAME [--backup DIR] --yes

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

target=''
project=apiarylens
backup=''
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
    --backup)
      backup=$2
      shift 2
      ;;
    --yes)
      confirmed=true
      shift
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$target" ] || al_die 64 "Usage: restore.sh --target DIR --project NAME [--backup DIR] --yes"
[ "$confirmed" = "true" ] ||
  al_die 64 "restore.sh replaces the live database and media and revokes all sessions; re-run with --yes to confirm"

al_require_command docker
al_ledger_require_ready
current="$target/current"
version=$(al_installed_version)
helper=$(al_helper_image)
secrets_dir="$target/secrets"
if [ -z "$backup" ]; then
  backup=$(find "$target/backups" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null |
    sort -nr | head -n 1 | cut -d' ' -f2-)
fi
[ -n "$backup" ] && [ -d "$backup" ] || al_die 65 "No backup directory to restore under $target/backups"
gzip -t "$backup/data.tar.gz" || al_die 65 "Backup archive failed integrity verification: $backup"

al_compose "$current" down
if [ -f "$backup/auth-root" ]; then
  mkdir -p "$secrets_dir"
  chmod 700 "$secrets_dir"
  cp "$backup/auth-root" "$secrets_dir/auth-root"
  chmod 644 "$secrets_dir/auth-root"
fi
docker run --rm --network none -v "${project}_apiarylens_data:/data" -v "$backup:/backup:ro" \
  "$helper" sh -c 'rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true; tar xzf /backup/data.tar.gz -C /data'
docker run --rm --network none --user 0:0 -v "${project}_apiarylens_data:/data" "apiarylens-api:$version" node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync("/data/apiarylens.sqlite");
  db.exec("DELETE FROM sessions");
  db.close();
'
al_compose "$current" up -d --wait

site_address=$(sed -n 's/^APIARYLENS_SITE_ADDRESS=//p' "$current/docker/.env" | head -n 1)
https_port=$(sed -n 's/^APIARYLENS_HTTPS_PORT=//p' "$current/docker/.env" | head -n 1)
al_health_verify "https://${site_address:-localhost}:${https_port:-443}/health" "$version" ||
  al_die 65 "The deployment restarted after restore but failed health verification"

al_ledger_append restore "$version" "$version" '' '' "$backup" restored
al_note "The backup at $backup was restored, all sessions were revoked, and health verification passed."
