# ApiaryLens on-prem lifecycle scripts

Backend lifecycle scripts for the Compose deployment profile (Design v2 §3.3,
work item C4) and the air-gap bundle variant (R4 / OPREM-001). They are the
stable, scriptable interface consumed by Scout Bee's compose adapter, by CI,
and by operators following the published runbooks — dependency-light POSIX
shell requiring only Docker Engine with the Compose v2 plugin, coreutils,
curl, and sha256sum on the host.

These scripts ship inside the air-gap bundle under `scripts/`; in the source
tree they live in `scripts/lifecycle/`.

## Commands

| Script | Purpose |
| --- | --- |
| `verify-bundle.sh --bundle-dir DIR [--target DIR] [--allow-channel-change] [--post-load]` | Verify an extracted air-gap bundle: member checksums, bundle format, update compatibility against the installed release, and (post-load) exact docker image IDs |
| `load-images.sh --bundle-dir DIR` | `docker load` the bundled images and verify loaded image IDs |
| `install-airgap.sh --bundle-dir DIR --target DIR [options]` | First install with zero egress: stage, load, migrate (one-shot, `--network none`), activate (`--no-build`, `pull_policy: never`), health-verify, commit |
| `update-airgap.sh --bundle-dir DIR --target DIR [--allow-channel-change] [--force]` | Transported update: verify, preflight, forced backup, stage, load, migrate, activate, verify, then commit — or recover: re-activate the previous release while the applied migration head still equals the head it shipped, otherwise restore the pre-update backup automatically |
| `backup.sh --target DIR --project NAME [--retention N]` | Verified backup of database + media + durable secrets; prints the backup path |
| `restore-test.sh --target DIR --project NAME [--backup DIR]` | Non-destructive restorability proof: archive integrity, scratch-volume restore, SQLite integrity check, and a migration-compatibility run of the release's one-shot migration entrypoint against the scratch copy |
| `restore.sh --target DIR --project NAME [--backup DIR] --yes [--force]` | Destructive restore of a verified backup; the backup is restore-tested on a scratch volume before the live deployment is stopped or any data is replaced; revokes all sessions; restarts and health-verifies |
| `rollback.sh --target DIR --project NAME [--to VERSION]` | Re-activate the retained previous release, only while the applied migration head equals the head that release shipped |
| `teardown.sh --target DIR --project NAME [--delete-data --yes-delete-my-data]` | Stop and remove services; keep-data is the default, permanent removal needs the typed confirmation flag |

## Exit codes (stable)

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 42 | Activation failed; the previous release was re-activated (or the failed install was stopped) |
| 64 | Usage error |
| 65 | Verification or refusal: checksums, tampered ledger, not-newer, downgrade, below minimum direct-upgrade source, channel change without opt-in, unknown bundle format, incompatible rollback |
| 69 | Preflight failure: unsupported architecture, Compose older than the bundle's tested minimum, insufficient disk headroom |
| 70 | Migration failure; services untouched (or restarted at the previous release), data restorable from the pre-update backup |
| 73 | Target directory cannot be prepared or is not owned by the invoking user |

## Deployment layout

Identical to the layout Scout Bee's compose adapter establishes:

```
<target>/
  releases/<version>/          staged release (docker/ compose files + .env,
                               release-identity.json, compatibility-manifest.json,
                               bundle-manifest.json)
  current                      symlink to the active release directory
  backups/<version>-<stamp>/   data.tar.gz + auth-root + release evidence
  secrets/                     bootstrap-token, auth-root (0700 dir)
  lifecycle/update-ledger.jsonl
```

## Update ledger

`lifecycle/update-ledger.jsonl` is the append-only, machine-verified record
of every mutating lifecycle operation (the on-host counterpart of the R3
Windows update ledger, per ADR 0025). One JSON object per line:

```json
{
  "at": "2026-07-18T12:00:00Z",
  "operation": "install|update|rollback|restore|backup|teardown",
  "fromVersion": "0.1.0-preview.2",
  "toVersion": "0.1.0-preview.3",
  "bundleDigest": "<sha256 of the bundle's bundle-manifest.json>",
  "migrationHead": "0004",
  "backupPath": "/opt/apiarylens/backups/0.1.0-preview.2-20260718T120000Z",
  "outcome": "staged|committed|migration-failed|activation-failed|verify-failed|rolled-back|rollback-failed|restored|recovery-failed|completed|stopped-kept-data"
}
```

Refusal rules enforced before any mutation:

- a ledger line that does not match the entry shape exactly → every
  operation refuses (tampered ledger);
- last entry `staged` (interrupted operation) → refuse until `--force`
  after manual recovery;
- bundle not newer than installed, downgrade, installed older than the
  bundle's `minimumDirectUpgradeSource`, or channel change without
  `--allow-channel-change` → refuse (evaluated by `verify-bundle.sh` from
  the bundled compatibility manifest, ADR 0021);
- bundle `bundleFormat` newer than the scripts understand → refuse
  (unknown-ahead).

## Design rules

- Every one-shot container runs with `--network none`; activation uses
  `--no-build` plus the `compose.airgap.yaml` override (`pull_policy:
  never`), so no lifecycle step can reach a registry (OPREM-001).
- Backups are verified at creation (`gzip -t`, `tar tzf`) and restore-tested
  without touching the live volume.
- Rollback is refused when the applied migration head differs from what the
  previous release shipped; the safe alternative is `restore.sh` from the
  pre-update backup (ADR 0021 rollback constraint). `update-airgap.sh`
  applies the same rule to its own failure path: after a failed activation
  or verification it re-activates the previous release only while the
  applied head is unchanged, and otherwise restores the pre-update backup
  (ledger outcome `restored`, or `recovery-failed` if even that fails).
- A destructive restore never begins until the backup has passed the full
  scratch-volume restore test, including the migration-compatibility run.
- Deletion consent is never inferred: keep-data is the default everywhere;
  permanent removal requires `--delete-data --yes-delete-my-data`.
