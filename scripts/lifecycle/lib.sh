# ApiaryLens on-prem lifecycle library (C4). POSIX sh; sourced by the
# lifecycle scripts in this directory. Requires: docker with the Compose v2
# plugin, coreutils, curl, sha256sum. No other host dependencies.
#
# Shared exit codes (stable interface for Scout Bee and automation):
#   0   success
#   42  activation failed; the previous release was re-activated
#   64  usage error
#   65  verification or refusal (checksums, ledger rules, compatibility)
#   69  preflight failure (host does not meet the supported envelope)
#   70  migration failure (services untouched; data restorable from backup)
#   73  target directory cannot be prepared or is not owned by this user
#
# Deployment layout under --target (same convention Scout Bee establishes):
#   releases/<version>/   one directory per staged release
#   current               symlink to the active release directory
#   backups/              verified data/media archives
#   secrets/              bootstrap-token, auth-root
#   lifecycle/update-ledger.jsonl   append-only update ledger (R3 parity)

set -eu

al_die() {
  al_code=$1
  shift
  printf 'ERROR: %s\n' "$*" >&2
  exit "$al_code"
}

al_note() {
  printf '%s\n' "$*"
}

al_require_command() {
  command -v "$1" >/dev/null 2>&1 || al_die 69 "Required command is not available: $1"
}

# Read a scalar value ("string" or number) for a top-level or uniquely named
# key from a pretty-printed JSON file. The lifecycle manifests are generated
# with stable two-space formatting and unique key names precisely so that an
# air-gapped host needs no JSON tooling before the product images are loaded.
al_json_get() {
  sed -n 's/^ *"'"$2"'": "\{0,1\}\([^",]*\)"\{0,1\},\{0,1\}$/\1/p' "$1" | head -n 1
}

al_json_require() {
  al_value=$(al_json_get "$1" "$2")
  [ -n "$al_value" ] || al_die 65 "Required key $2 is missing from $1"
  printf '%s\n' "$al_value"
}

# Compare two semantic versions; prints lt, eq, or gt. A release always
# outranks any prerelease of the same base version; prerelease identifiers
# are compared with version sort (numeric segments compare numerically).
al_compare_versions() {
  al_a=$1
  al_b=$2
  if [ "$al_a" = "$al_b" ]; then
    echo eq
    return 0
  fi
  al_abase=${al_a%%-*}
  al_bbase=${al_b%%-*}
  if [ "$al_abase" != "$al_bbase" ]; then
    al_first=$(printf '%s\n%s\n' "$al_abase" "$al_bbase" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)
    if [ "$al_first" = "$al_abase" ]; then echo lt; else echo gt; fi
    return 0
  fi
  al_apre=${al_a#"$al_abase"}
  al_bpre=${al_b#"$al_bbase"}
  if [ -z "$al_apre" ]; then
    echo gt
    return 0
  fi
  if [ -z "$al_bpre" ]; then
    echo lt
    return 0
  fi
  al_first=$(printf '%s\n%s\n' "$al_a" "$al_b" | sort -V | head -n 1)
  if [ "$al_first" = "$al_a" ]; then echo lt; else echo gt; fi
}

al_ledger_path() {
  printf '%s/lifecycle/update-ledger.jsonl\n' "$target"
}

# Append one entry. Arguments:
#   operation fromVersion toVersion bundleDigest migrationHead backupPath outcome
al_ledger_append() {
  mkdir -p "$target/lifecycle"
  printf '{"at":"%s","operation":"%s","fromVersion":"%s","toVersion":"%s","bundleDigest":"%s","migrationHead":"%s","backupPath":"%s","outcome":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" "$5" "$6" "$7" \
    >>"$(al_ledger_path)"
}

# Every ledger line must match the exact entry shape; anything else means the
# ledger was edited or corrupted and every mutating operation refuses to run.
al_ledger_verify() {
  al_ledger=$(al_ledger_path)
  [ -f "$al_ledger" ] || return 0
  if grep -qEv '^\{"at":"[0-9TZ:.-]+","operation":"[a-z-]+","fromVersion":"[^"]*","toVersion":"[^"]*","bundleDigest":"[0-9a-f]*","migrationHead":"[0-9]*","backupPath":"[^"]*","outcome":"[a-z-]+"\}$' "$al_ledger"; then
    al_die 65 "The update ledger at $al_ledger is tampered or corrupted; refusing every lifecycle operation until it is repaired from backup evidence"
  fi
}

al_ledger_last_outcome() {
  al_ledger=$(al_ledger_path)
  [ -f "$al_ledger" ] || {
    echo none
    return 0
  }
  tail -n 1 "$al_ledger" | sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p'
}

# Refuse to start a new mutating operation while a previous one is
# interrupted mid-flight (last entry still "staged"), unless forced.
al_ledger_require_ready() {
  al_ledger_verify
  if [ "$(al_ledger_last_outcome)" = "staged" ] && [ "${force:-false}" != "true" ]; then
    al_die 65 "The update ledger records an interrupted operation; inspect $(al_ledger_path) and re-run with --force after manual recovery"
  fi
}

al_current_release_dir() {
  [ -e "$target/current" ] || al_die 65 "No active release: $target/current does not exist"
  if command -v readlink >/dev/null 2>&1 && [ -L "$target/current" ]; then
    readlink -f "$target/current"
  else
    printf '%s/current\n' "$target"
  fi
}

al_installed_version() {
  al_identity="$target/current/release-identity.json"
  [ -f "$al_identity" ] || al_die 65 "The active release has no release-identity.json"
  al_json_require "$al_identity" productVersion
}

al_installed_channel() {
  al_json_require "$target/current/release-identity.json" channel
}

# docker compose against a release directory; extra file args appended when
# the release ships the air-gap override so builds and pulls stay impossible.
al_compose() {
  al_release=$1
  shift
  if [ -f "$al_release/docker/compose.airgap.yaml" ]; then
    docker compose -p "$project" --env-file "$al_release/docker/.env" \
      -f "$al_release/docker/compose.yaml" -f "$al_release/docker/compose.airgap.yaml" "$@"
  else
    docker compose -p "$project" --env-file "$al_release/docker/.env" \
      -f "$al_release/docker/compose.yaml" "$@"
  fi
}

al_helper_image() {
  # The backup/restore helper image ships inside the air-gap images archive
  # so these operations never pull from a registry (OPREM-001 gap G5).
  al_manifest="$target/current/bundle-manifest.json"
  if [ -f "$al_manifest" ]; then
    al_json_get "$al_manifest" helperImage
  else
    echo alpine:3.22
  fi
}

al_health_verify() {
  al_url=$1
  al_expected=$2
  al_attempts=0
  while [ "$al_attempts" -lt 30 ]; do
    al_body=$(curl -k -fsS --max-time 5 "$al_url" 2>/dev/null) && break
    al_body=''
    al_attempts=$((al_attempts + 1))
    sleep 2
  done
  [ -n "$al_body" ] || {
    al_note "Health endpoint $al_url did not answer"
    return 1
  }
  printf '%s' "$al_body" | grep -q '"status":"ok"' || {
    al_note "Health endpoint $al_url did not report status ok: $al_body"
    return 1
  }
  printf '%s' "$al_body" | grep -q "\"version\":\"$al_expected\"" || {
    al_note "Health endpoint $al_url reports a different release identity than $al_expected: $al_body"
    return 1
  }
  return 0
}

al_prepare_target() {
  if [ -e "$target" ] || [ -L "$target" ]; then
    { [ ! -L "$target" ] && [ -d "$target" ] && [ -w "$target" ]; } ||
      al_die 73 "Target $target exists but is not a writable directory owned by this user"
    [ "$(stat -c '%u' "$target")" = "$(id -u)" ] || al_die 73 "Target $target is not owned by this user"
  else
    mkdir -p "$target" || al_die 73 "Target $target could not be created"
  fi
  chmod 700 "$target"
  mkdir -p "$target/releases" "$target/backups" "$target/secrets" "$target/lifecycle"
  chmod 700 "$target/secrets"
}

# The migration head a staged release shipped, read from its release-dir
# manifests; prints nothing when the release records no head.
al_release_migration_head() {
  if [ -f "$1/bundle-manifest.json" ]; then
    al_json_get "$1/bundle-manifest.json" migrationHead
  elif [ -f "$1/compatibility-manifest.json" ]; then
    al_json_get "$1/compatibility-manifest.json" head
  fi
}

# Decide how to recover after a failed activation or verification: the
# previous release may be re-activated only while the applied migration head
# equals the head it shipped (ADR 0021 rollback constraint). Anything else —
# a schema that moved forward, or a previous release whose head is unknown —
# must restore the pre-update backup instead of running old code against a
# newer database. Prints "reactivate" or "restore".
al_recovery_mode() {
  al_previous_head=$1
  al_applied_head=$2
  if [ -n "$al_previous_head" ] && [ -n "$al_applied_head" ] &&
    [ "$al_previous_head" = "$al_applied_head" ]; then
    echo reactivate
  else
    echo restore
  fi
}

al_migration_head_of_volume() {
  # Read the applied migration head from the deployment's data volume with a
  # one-shot, network-isolated container; prints nothing for an empty volume.
  al_image=$1
  docker run --rm --network none -v "${project}_apiarylens_data:/data:ro" "$al_image" node -e '
    const { DatabaseSync } = require("node:sqlite");
    try {
      const db = new DatabaseSync("/data/apiarylens.sqlite", { readOnly: true });
      const rows = db.prepare("SELECT version FROM migrations ORDER BY rowid").all();
      db.close();
      if (rows.length > 0) console.log(rows.at(-1).version);
    } catch {
      /* empty or absent database: print nothing */
    }
  '
}
