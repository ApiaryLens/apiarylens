# Standalone-to-connected migration and rollback spike

- **Backlog:** WIN-006
- **Date:** 2026-07-16
- **Status:** Research in progress; implementation is not authorized
- **Scope:** Windows standalone client to a connected ApiaryLens family deployment

## Decision sought

Define a migration protocol that can attach an existing standalone Windows client to
a Scout-provisioned backend without losing or duplicating records, media, pending
work, or the ability to recover. Connecting must be a controlled data migration, not
a server-URL preference.

This spike evaluates the current synchronization, database, media, identity, export,
backup, and update contracts. It also exercises a research-only migration journal
against the real `SqliteStore` and `FilesystemMediaStore` implementations. It does
not add a product migration endpoint or Windows-client implementation.

## Existing contract findings

### Capabilities that can be reused

- Sync contract v1 carries stable operation, client, entity, and base-version
  identifiers. The server stores an operation fingerprint by organization, user, and
  operation ID, so an identical retry returns `duplicate` and a changed retry is
  rejected.
- Record writes are transactional inside SQLite and produce an ordered change feed.
- Stale updates and colliding creates return a conflict with client and server values.
- Media metadata participates in normal record sync, while original and thumbnail
  bytes use organization-scoped private media storage.
- Full export already includes a format version, organization identity, domain data,
  and media bytes.
- The release lifecycle already requires compatibility checks, verified backups,
  observable migrations, health verification, and explicit handling of irreversible
  changes.

### Gaps that ordinary sync cannot safely cover

1. **Organization identity:** standalone and target deployments normally have
   different organization IDs. Local IndexedDB keys and all server resources are
   organization-scoped. Sync does not define organization adoption or remapping.
2. **Identity boundary:** users, password hashes, recovery codes, invitations,
   sessions, CSRF state, and audit actors belong to the target identity system. They
   must not be copied as domain records.
3. **Migration completeness:** sync has no immutable source inventory, completion
   manifest, source/target count comparison, or canonical record hash.
4. **Media atomicity:** metadata, original bytes, and thumbnail bytes are separate
   operations. A metadata success does not prove media completeness.
5. **Cursor ownership:** the web client uses one `syncCursor` setting rather than a
   cursor explicitly keyed by connection profile and organization. Reusing it across
   a cutover would be unsafe.
6. **Pending local work:** ordinary sync can retry the outbox, but it does not freeze
   or checkpoint a complete standalone migration source.
7. **Cutover:** there is no journaled, atomic switch between the loopback standalone
   service and a connected endpoint.
8. **Rollback:** once a connected target accepts remote-only writes, simply restoring
   the old standalone endpoint would hide those writes and create two authorities.
9. **Import authorization:** the API has no privileged, auditable migration session
   or import permission distinct from normal interactive edits.

The full-export archive is useful as a source snapshot, but export format v1 lacks
per-object hashes, thumbnails, compatibility ranges, a migration ID, a target mapping,
and signed completion evidence. It is not yet a migration bundle.

## Research prototype

The research harness is
[`scripts/research/win006-migration-spike.mjs`](../../scripts/research/win006-migration-spike.mjs).
It builds on the released-code paths for the SQLite database and filesystem media
adapter. It creates separate standalone and target databases with different
organization and user identities, then transfers four related records and one media
object through a durable journal.

The local run passed these scenarios:

- complete transfer, reconciliation, atomic cutover, backup restoration, and safe
  rollback;
- interruption immediately after each of four record writes and the media write,
  followed by successful resume;
- exact retry of an already-applied record through the real idempotency table;
- idempotent overwrite and hash verification of an already-copied media object;
- successful transfer and reconciliation of the maximum 25 MiB original plus its
  thumbnail as independently journaled variants;
- preservation, backup, transfer, and reconciliation of a non-empty pending outbox;
- idempotent replay of a create/delete history with the resulting record remaining a
  tombstone on the target change feed;
- 20,000 structured records—the accepted family model's approximate active-year
  workload—applied and reconciled through 200 bounded in-memory batches, including
  one exact duplicate receipt per batch;
- colliding target record reported as a conflict while the client remains standalone;
- target media corruption detected before cutover;
- incompatible sync-contract version rejected before transfer;
- remote-only write after cutover prevents destructive rollback; and
- an exclusive target-database lock blocks cutover and the same journal resumes after
  the lock is released;
- a modified backup database is rejected against its recorded SHA-256 before restore;
  and
- a real child process terminated immediately after a target write but before the
  journal checkpoint releases its handles, preserves standalone authority, and
  resumes through an exact duplicate receipt; and
- journal, client configuration, and sanitized evidence contain no seeded secret.

The workflow
[`win006-migration-research.yml`](../../.github/workflows/win006-migration-research.yml)
runs the same evidence on `windows-latest` with Node 24 and locked dependencies. The
checked-in harness and workflow are research evidence only; the eventual protocol
must be implemented behind accepted ADRs and authorization boundaries.

### Scale finding

The family capacity model estimates approximately 20,000 structured
inspection-related writes per active year. It does not establish a hard maximum
record count, so this spike treats 20,000 as a dated reference workload rather than a
product limit.

The real SQLite store transferred and reconciled 20,000 records in 200 batches of 100
when both stores were in memory. A separate attempt to drive the same workload
through the research JSON journal and one durable SQLite transaction per item ran for
more than five minutes and was intentionally stopped. That negative result is a
design finding: normal interactive sync writes plus repeated whole-file JSON journal
replacement are not an acceptable bulk migration implementation.

The production design therefore needs a SQLite-backed migration journal and bounded
server-side import transactions with per-item receipts. The current evidence proves
the record model, batching, idempotency, and reconciliation at the annual reference
count; it does **not** prove a durable 20,000-record packaged migration. The latter
remains an exact-artifact acceptance gate after the bulk-import contract exists.

The database-busy injection also showed that a store should be opened and validated
before the operation boundary is locked. Constructing a new store while another
connection holds an exclusive lock can fail during schema initialization; process
exit releases the handle, but an in-process orchestrator must not rely on that. The
native host must treat store-open failure as a startup/preflight failure and keep the
standalone profile authoritative.

GitHub Actions run
[`29550672120`](https://github.com/ApiaryLens/apiarylens/actions/runs/29550672120)
passed all steps on the Windows hosted runner and retained the sanitized
`win006-migration-evidence` artifact for 14 days.

Follow-up run
[`29550827123`](https://github.com/ApiaryLens/apiarylens/actions/runs/29550827123)
passed the maximum 25 MiB original and thumbnail extension on the Windows hosted
runner.

Follow-up run
[`29550918994`](https://github.com/ApiaryLens/apiarylens/actions/runs/29550918994)
passed preservation of a non-empty pending outbox on the Windows hosted runner.

Follow-up run
[`29550982088`](https://github.com/ApiaryLens/apiarylens/actions/runs/29550982088)
passed idempotent tombstone replay and the full accumulated scenario set on the
Windows hosted runner.

Follow-up run
[`29551569039`](https://github.com/ApiaryLens/apiarylens/actions/runs/29551569039)
passed the 20,000-record annual reference workload, 200 bounded batches, and the full
accumulated suite on the Windows hosted runner in 66 seconds.

Follow-up run
[`29551863590`](https://github.com/ApiaryLens/apiarylens/actions/runs/29551863590)
passed target-database lock recovery, corrupt-backup rejection, and the accumulated
suite on the Windows hosted runner in 47 seconds.

## Proposed migration protocol

### Durable objects

The migration needs four explicit, versioned objects:

| Object | Purpose | Secret handling |
|---|---|---|
| Migration journal | Phase, item state, attempts, conflicts, recovery action | IDs and hashes only |
| Source inventory | Canonical domain-record and media hashes plus counts | No credentials or sessions |
| Target receipt | Accepted mapping, target versions, media verification, final cursor | Signed or authenticated evidence; no tokens |
| Connection profile | Endpoint, deployment identity, target organization, contract ranges | Credential reference only; secret remains in the OS vault |

Writes to the journal and connection profile must use write-through temporary files,
atomic replacement, restrictive per-user ACLs, and recovery of an abandoned temporary
file. The journal is resumable state, not a log.

### State machine

1. **Preflight:** verify client, product, API, sync, export, database, and migration
   contract ranges; target health; owner authentication; import permission; target
   capacity; clock sanity; and sufficient local space.
2. **Quiesce:** finish the active edit, pause automatic sync and standalone writes,
   checkpoint SQLite, and record the local outbox/media state. Never discard failed,
   conflicted, or pending work.
3. **Protect:** create a consistent standalone backup including database, original
   media, thumbnails, local client state, and the pre-connect profile. Restore-test it
   before transfer.
4. **Inventory:** produce canonical hashes and counts for every supported domain
   record, tombstone, media variant, and pending operation. Exclude all identity and
   secret tables.
5. **Negotiate identity:** authenticate the target owner and choose one of:
   create an empty target family that adopts the standalone organization identity;
   import into a different empty target organization through an explicit mapping; or
   merge into a non-empty target with conflict preview. Cancellation leaves the
   standalone authority unchanged.
6. **Transfer:** create a target migration session and use stable migration item IDs.
   Records and media are independently resumable. A repeated item with the same hash
   returns the prior receipt; reuse with different content is rejected.
7. **Reconcile:** compare source inventory with target receipts, target query results,
   record hashes, media byte hashes, relationship integrity, tombstones, counts, and
   permissions. Any mismatch blocks cutover.
8. **Cut over:** capture the target cursor, create a fresh cursor scoped to the target
   connection and organization, atomically replace the connection profile, then run a
   pull and health check. Only this step changes the client's authority.
9. **Observe:** retain the read-only pre-connect source and backup for the documented
   recovery window. Show migration ID, completion receipt, backup, and rollback status
   to the owner.
10. **Finalize:** after the recovery window and explicit owner confirmation, retire
    the old standalone authority while retaining the supported backup/export.

Every phase is monotonic and safely repeatable. A crash before cutover resumes or
cancels back to standalone. A crash during atomic cutover resolves from the journal
and profile identity. A crash after cutover never guesses which side is authoritative.

## Organization and identity recommendation

Prefer **organization adoption for a newly created, empty target**: Scout provisions
the target family using the standalone organization ID before any domain data exists.
This preserves entity relationships and client keys without a broad local rewrite.
The server must prove that the organization ID is unused and that the authenticated
owner authorized adoption.

For import into an existing organization, require an explicit mapping protocol and
conflict preview. Preserve entity IDs where they do not collide; otherwise generate a
complete relationship mapping before applying anything. Never mutate only a subset of
foreign keys.

The target owner account remains the target owner account. Domain authorship may
retain display-only provenance, but user IDs and authentication material are never
migrated. The target audit log records the migration actor, migration ID, source
installation ID, accepted hashes, and outcome.

## Conflict and rollback rules

- No target mutation occurs until compatibility, backup, and inventory gates pass.
- A non-empty target always requires a dry-run conflict preview.
- Default conflict behavior is stop-and-review. Bulk source-wins or target-wins is
  never implicit.
- Before cutover, cancellation leaves the standalone source authoritative and may
  delete only target objects proven to belong exclusively to the migration ID.
- After cutover, endpoint rollback is allowed only when the target change cursor and
  migration receipt prove there are no remote-only writes.
- If remote-only writes exist, the safe choices are reconnect, complete a reverse
  export/import with reconciliation, or create a new standalone copy after explicit
  confirmation. The product must not call endpoint reversal a rollback.
- Database-schema rollback and data-authority rollback are separate operations.

## Required product contracts before implementation

1. Versioned migration-plan, inventory, item, conflict-preview, and receipt schemas.
2. Canonical hashing rules, including field normalization and tombstones.
3. Target migration-session endpoints with owner authorization, organization
   isolation, expiration, cancellation, quotas, and audit records.
4. Idempotent, bounded-batch record and media import endpoints scoped by migration ID
   and item hash, with a durable receipt for every item.
5. Per-connection and per-organization local sync cursors.
6. A Windows local-store quiesce/checkpoint/backup/restore contract.
7. Atomic connection-profile storage whose credentials are references to native
   protected storage defined by WIN-005.
8. Completion and rollback-eligibility queries that detect post-cutover target writes.
9. Exact release compatibility metadata for migration and export contract ranges.
10. Diagnostics and support bundles that redact credentials, tokens, paths containing
    account names, and private hive content by default.

## Further evidence required to close WIN-006

- Durable packaged migration at the 20,000-record annual family reference workload
  after the SQLite journal and bounded bulk-import contract exist. The record model
  and reconciliation pass at that count in memory; this is not yet packaged evidence.
- Inject disk-full, access-denied, target timeout, expired auth, and partial media
  failures at each state boundary. Real post-write process termination,
  database-busy resume, and corrupt-backup rejection are now covered at the
  package-adapter level.
- Prove restored backup equivalence for the packaged Windows runtime, not only the
  package-level SQLite and filesystem adapters.
- Define and test D1/R2 target behavior as well as Node SQLite/filesystem behavior.
- Test organization adoption and mapping with server-side negative authorization and
  cross-organization isolation cases.
- Prove that a rotation or loss of the target credential cannot corrupt the source,
  journal, or completion evidence.
- Exercise the exact signed Windows artifact and exact released backend artifact on a
  clean Windows profile and clean connected targets.

## Recommendation

Proceed to an ADR and detailed protocol design with a **journaled staged-copy model**.
Do not implement connecting as ordinary sync, destructive move, source-database copy,
or endpoint toggle. Keep the standalone source intact until verified reconciliation
and atomic cutover; block destructive rollback once the connected authority has
accepted new writes.
