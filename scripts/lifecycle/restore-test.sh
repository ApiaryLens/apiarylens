#!/bin/sh
# Non-destructively verify that a backup archive is restorable: archive
# integrity, extraction into a scratch volume, SQLite integrity check, and
# migration-ledger readability — all with network-isolated one-shot
# containers and no change to the running deployment.
#
# Usage: restore-test.sh --target DIR --project NAME [--backup DIR]
# Default backup: the newest directory under <target>/backups.

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

target=''
project=apiarylens
backup=''
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
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$target" ] || al_die 64 "Usage: restore-test.sh --target DIR --project NAME [--backup DIR]"

al_require_command docker
version=$(al_installed_version)
helper=$(al_helper_image)
if [ -z "$backup" ]; then
  backup=$(find "$target/backups" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null |
    sort -nr | head -n 1 | cut -d' ' -f2-)
fi
[ -n "$backup" ] && [ -d "$backup" ] || al_die 65 "No backup directory to test under $target/backups"
[ -f "$backup/data.tar.gz" ] || al_die 65 "Backup $backup has no data.tar.gz archive"

gzip -t "$backup/data.tar.gz" || al_die 65 "Backup archive failed gzip integrity verification: $backup"
tar tzf "$backup/data.tar.gz" >/dev/null || al_die 65 "Backup archive is not a readable tar: $backup"
tar tzf "$backup/data.tar.gz" | grep -q '^\./apiarylens\.sqlite$\|^apiarylens\.sqlite$' ||
  al_die 65 "Backup archive does not contain the apiarylens.sqlite database"

scratch="${project}_restore_test_$$"
cleanup() { docker volume rm -f "$scratch" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker volume create "$scratch" >/dev/null
docker run --rm --network none -v "$scratch:/data" -v "$backup:/backup:ro" \
  "$helper" sh -c 'tar xzf /backup/data.tar.gz -C /data'
docker run --rm --network none -v "$scratch:/data:ro" "apiarylens-api:$version" node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync("/data/apiarylens.sqlite", { readOnly: true });
  const integrity = Object.values(db.prepare("PRAGMA integrity_check").get())[0];
  if (String(integrity) !== "ok") {
    console.error(JSON.stringify({ integrity }));
    process.exit(1);
  }
  const rows = db.prepare("SELECT version FROM migrations ORDER BY rowid").all();
  if (rows.length === 0) {
    console.error("The restored database has an empty migration ledger");
    process.exit(1);
  }
  console.log(JSON.stringify({ integrity: "ok", migrationHead: rows.at(-1).version }));
  db.close();
' || al_die 65 "Restore test failed: the backup did not restore to a healthy database"

al_note "Restore test passed for $backup"
