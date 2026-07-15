# ADR 0009: Data, Media, and Offline Synchronization

## Status

Accepted

## Date

2026-07-15

## Acceptance

Accepted under the project owner's delegated MVP implementation authority.

## Context

The PWA must accept complete field work with no network, preserve it across a page
reload or device restart, and later synchronize multiple family devices without
duplicates or silent overwrites. Cloudflare D1 and a portable server need different
runtime adapters, but separate schemas or behavior would create two products.
Photos must not consume the relational database allowance and must be included in
backup, export, and authorization rules.

## Decision

ApiaryLens uses a shared, migration-owned SQLite schema for both server profiles:

- Cloudflare D1 is the relational store for the family-cloud profile.
- Node `node:sqlite` is the relational store for Compose.
- SQL stays within the tested intersection of current SQLite and D1 behavior.
- A small asynchronous SQL port isolates binding, transactions, and result-shape
  differences. Domain repositories and migrations are shared.
- Compose enables foreign keys and WAL mode. Backup procedures use SQLite's backup
  API or a consistent checkpointed copy; copying only the main file while WAL is
  active is forbidden.
- Cloudflare uses D1 Time Travel for provider recovery and a product-level portable
  export for migration. Provider recovery is not a substitute for user-controlled
  export and media backup.

The PWA uses IndexedDB through Dexie for the local replica, outbox, sync cursor,
conflicts, cached media metadata, and pending media blobs. The service worker caches
the application shell; static caching alone is never described as offline data
support.

Every synchronizable record has a stable UUID, organization ID, created and updated
timestamps, integer version, and optional tombstone timestamp. Every client write
has a stable operation ID and the base entity version. The API:

1. returns the prior result when an operation ID is retried;
2. applies a write exactly once when the base version is current;
3. appends an organization-scoped change-log entry in the same transaction;
4. returns a visible conflict containing server and client values when concurrent
   edits cannot be safely merged; and
5. exposes ordered cursor-based pull batches with retention and full-resync rules.

Independent append-only event records may merge automatically. Mutable identity,
hive, inspection, and treatment records use optimistic concurrency. ApiaryLens does
not use timestamp-based last-writer-wins for material beekeeper data. Deletions are
tombstoned until all supported clients can observe them or retention expires.

Media bytes use private R2 objects on Cloudflare and a private filesystem volume in
Compose. The relational store contains authorization-scoped metadata, size, media
type, hash, dimensions, capture time, and upload state. The client generates an MVP
display thumbnail before upload. Downloads pass through an authorized API or a
short-lived signed mechanism; public buckets are not used for private hive media.

Portable export contains versioned JSON/CSV relational data, a media manifest with
hashes, the media files, and release/contract metadata. Restore validates format,
hashes, schema compatibility, and organization ownership before activation.

## Initial Model

The accepted MVP entities are organization, user, membership, session, invitation,
recovery code, apiary, hive, queen, equipment box, inspection, media asset, mite
count, health observation, feeding event, treatment event, harvest, follow-up item,
change-log entry, idempotency record, and audit event. Weather snapshots may be
attached to inspections without requiring a weather provider.

Frame-level inventories, sensors, AI review, clubs, research datasets, public
sharing, galleries, registries, and commercial operations remain compatible future
extensions, not hidden MVP requirements.

## Consequences

- A family installation has one relational engine and no database service to
  operate in Compose.
- D1 and Compose conformance tests are mandatory for migrations, domain rules,
  authorization, synchronization, export, and restore.
- Large commercial installations may eventually need PostgreSQL and object-storage
  adapters; the public contracts and stable identifiers permit migration without
  changing the PWA.
- Browser storage is a working replica, not the only durable family copy. The UI
  exposes local, pending, synchronized, conflicted, and failed states.
- Database and media backups are one logical recovery set and are verified together.

## References

- [Data model](../architecture/data-model.md)
- [Offline synchronization protocol](../architecture/offline-sync-protocol.md)
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)
- [Cloudflare D1 backup and restore](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Dexie documentation](https://dexie.org/docs/)

