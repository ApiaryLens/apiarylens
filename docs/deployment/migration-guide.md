# Migration and Compatibility Guide

## Contract Set

Every migration is evaluated against the product version, API contract,
synchronization contract, database migration head, local-store version,
deployment-plan schema, and export/backup format in the release manifest.

## Database Migrations

Migration files are immutable after release and run in filename order. Operators
must test the upgrade from every directly supported predecessor using representative
identity, family, inspection, media, idempotency, and change-history data. Re-running
an applied migration must be harmless or refused clearly by the migration engine.

## PWA Local Store

The PWA must preserve cached records, inspection drafts, outbox operations, staged
originals, and thumbnails during a service-worker or IndexedDB upgrade. The update
prompt waits while work is pending. Clearing site data is not a migration method.

## Cross-Profile Movement

Use a complete owner export for user-controlled portability and a verified platform
backup for disaster recovery. A Cloudflare backup is not restored into Compose by
copying D1 files, and a Compose volume is not uploaded directly into D1. Cross-profile
migration imports the versioned portable data contract and media after validating
organization ownership and IDs.

Public Preview 1 exposes export and backup contracts, but cross-profile import
automation is not accepted until the UAT record proves identity, records, media,
and history on the destination. Preserve the source deployment until that proof is
complete, and keep a current backup because Preview is not a stable release.

## Failure Recovery

- Before activation: discard staged code and leave the current revision running.
- After activation with backward-compatible migrations: restore the prior immutable
  application revision and verify health.
- After an incompatible or partial migration: stop writes and restore the complete
  pre-update backup.
- PWA update failure: retain the current service worker and local data, then retry
  only after pending work is synchronized or exported.
