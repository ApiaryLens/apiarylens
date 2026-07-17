# ADR 0019: Standalone-to-Connected Migration and Authority Cutover

## Status

Proposed

## Date

2026-07-17

## Deciders

ApiaryLens project owner after WIN-006 evidence and the acceptance conditions below
are satisfied. This proposal does not authorize product implementation.

## Context

A standalone Windows installation owns local records, media, identifiers, pending
operations, and user expectations. Adding family access cannot be implemented as a
server URL toggle or ordinary first sync: the target may have a different
organization/identity boundary, existing records, incompatible contracts, limited
capacity, and conflicts. Interruption can occur after some target writes or during
authority cutover.

The migration must preserve offline work, never copy authentication material, prove
record/media equivalence, support deterministic resume, and distinguish endpoint
reversal from a safe data-authority rollback.

## Decision

Use a journaled staged-copy migration with verified reconciliation and one atomic
authority cutover. The standalone source remains intact and authoritative until the
target proves complete.

### Versioned durable objects

The protocol defines four secret-free or secret-referencing durable objects:

| Object | Purpose |
|---|---|
| Migration journal | Monotonic phase, item state, attempts, conflicts, cutover and recovery action; IDs/hashes only |
| Source inventory | Canonical record/tombstone/media/pending-operation identities, hashes, relationships, and counts |
| Target receipt | Authenticated migration/target identity, accepted mappings and hashes, contract versions, media verification, final cursor, and rollback eligibility |
| Connection profile | Endpoint/deployment/organization identity and compatibility ranges; credential reference only |

Every object has a schema version and exact migration ID. Journal/profile writes use
restrictive per-user ACLs, write-through temporary state, atomic replacement, and
abandoned-write recovery. Credentials remain in the protected native store defined
by ADR 0017 and never enter these objects, logs, diagnostics, backups, or plans.

### State machine

1. **Preflight** verifies product/API/sync/export/database/migration ranges, target
   health/capacity, owner authentication/import permission, time, and local space.
2. **Quiesce** finishes the active edit, pauses standalone writes/automatic sync,
   checkpoints SQLite, and records every pending/conflicted/media state without
   discarding it.
3. **Protect** creates and restore-verifies a consistent backup of database, original
   media, derivatives needed for recovery, local client state, and pre-connect
   profile.
4. **Inventory** canonicalizes and hashes all supported records, relationships,
   tombstones, media bytes/variants, and pending operations while excluding identity
   secrets and server session tables.
5. **Negotiate identity** chooses authorized organization adoption, explicit mapping
   into an empty organization, or reviewed merge into a non-empty organization.
6. **Transfer** uses an expiring, owner-authorized target migration session and
   stable item IDs. Repeating the same ID/hash returns the prior receipt; the same ID
   with different content is rejected. Records/media use bounded resumable batches.
7. **Reconcile** proves source inventory against receipts, target queries, hashes,
   counts, relationships, tombstones, permissions, and media bytes. Any mismatch
   blocks cutover.
8. **Cut over** captures the target change cursor, creates connection-scoped local
   sync state, atomically replaces the connection profile/authority marker, then
   performs a target pull and health/authorization check.
9. **Observe** retains the source as read-only plus the verified backup and receipt
   for a documented recovery window while displaying migration/rollback status.
10. **Finalize** retires standalone authority only after the recovery window and
    explicit owner confirmation, while retaining supported backup/export evidence.

Every phase is monotonic and restartable. Before cutover, cancellation returns to
the unchanged standalone source. During cutover, the journal resolves exactly which
authority was committed. After cutover, the client never guesses or writes to both
authorities concurrently.

### Organization and identity

For a newly provisioned empty target, prefer authorized adoption of the standalone
organization ID before any domain object exists. The target proves the ID is unused
and the authenticated owner authorized adoption.

For a different or non-empty target organization, require a complete dry-run mapping
and conflict preview. Preserve entity IDs when collision-free; otherwise generate
and validate the entire relationship mapping before mutation. Partial foreign-key
rewrites are forbidden.

The target owner remains the target owner. Passwords, sessions, recovery codes,
memberships, role grants, provider identities, and deployment credentials are never
migrated. Display-only authorship provenance may be retained. The server audit log
records the migration actor, source installation, migration ID, accepted hashes,
organization mapping, and outcome without private record content.

### Conflicts and rollback

- A non-empty target always receives a dry-run conflict preview.
- Default conflict behavior is stop-and-review; bulk source-wins/target-wins is never
  implicit.
- Before cutover, cancellation may delete only target objects whose migration
  receipts prove they were created exclusively by this migration ID.
- After cutover, direct endpoint rollback is allowed only when the target cursor and
  receipt prove there are no remote-only writes and the source can resume without
  losing target history.
- If remote-only writes exist, reconnect, complete a reconciled reverse
  export/import, or create a new explicitly confirmed standalone copy. Endpoint
  reversal is not labeled rollback.
- Application/schema rollback and data-authority rollback are separate decisions.

## Options considered

### Journaled staged copy with atomic cutover — proposed

Preserves source authority until equivalence is proven, supports bounded resume, and
makes failure/cutover evidence explicit. It has more protocol and UI work but is the
only option that meets the no-data-loss contract.

### Start normal synchronization against the target

Cannot safely establish identity, initial authority, full inventory, media
equivalence, or rollback eligibility and may interleave live target writes. Rejected.

### Copy the standalone SQLite database/files directly

Couples target storage implementation, bypasses server authorization/audit, fails
for D1/R2, and risks copying local identity/session material. Rejected.

### Destructive move then connect

Makes interruption and target failure destructive and removes the source recovery
boundary before success is proven. Rejected.

### Export/import without a durable migration session

Useful as a portable recovery tool but lacks item idempotency, resumable receipts,
conflict preview, atomic authority cutover, and exact rollback eligibility. Rejected
as the connected-mode protocol.

## Consequences

- The API gains owner-authorized migration sessions, bounded idempotent record/media
  import, conflict preview, reconciliation, completion receipt, and audit endpoints.
- The Windows local store gains a durable journal, inventory/canonical hashing,
  quiesce/checkpoint, connection-scoped cursors, and atomic authority/profile state.
- Connecting large apiaries takes observable staged time and requires capacity for a
  verified backup plus source retention during the recovery window.
- Users can safely cancel before cutover; post-cutover rollback is intentionally
  constrained once family members create remote-only work.
- Cloudflare D1/R2 and Node SQLite/filesystem targets must produce equivalent
  receipts and conformance evidence without sharing implementation internals.
- The protocol scales through bounded batches and durable receipts; the 20,000-
  record family reference workload is a minimum packaged acceptance case, not a
  product maximum.

## Repository and gallery impact

Core owns migration schemas, canonical hashing, target API behavior, local ports,
compatibility declarations, and conformance vectors. Scout may provision the target
and start/observe the guided operation but does not read credentials or bypass the
client/server migration protocol. `my-apiarylens` may consume immutable contracts and
evidence; it does not copy source. No gallery or registry applies because migration
code and mapping rules are security-sensitive product contracts, not installable
community assets.

## Acceptance conditions

This ADR may move to Accepted only after:

1. Versioned plan, journal, inventory, item, conflict-preview, mapping, receipt, and
   connection-profile schemas plus canonical hash/test vectors are reviewed.
2. D1/R2 and Node SQLite/filesystem target endpoints enforce owner/import permission,
   organization isolation, session expiry, quotas, audit, item hash idempotency, and
   bounded batches with negative tests.
3. Exact packaged Windows tests prove quiesce, restore-tested backup, inventory,
   20,000-record/media transfer, interruption/resume at every phase, reconciliation,
   atomic cutover, reconnect, and finalization.
4. Empty-target adoption, empty-target mapping, non-empty conflict preview, ID
   collision/relationship remap, tombstone, pending-operation, and cross-
   organization authorization cases pass.
5. Disk-full, access-denied, corrupt backup/journal, target timeout, expired/revoked
   auth, capacity/quota, partial media, incompatible schema/contract, process death,
   and unavailable rollback fail without lost or split-brain source authority.
6. Pre-cutover cancellation cleanup and post-cutover no-remote-write rollback pass;
   remote-only writes correctly block endpoint reversal and guide a safe alternative.
7. Plans, journals, receipts, connection profiles, logs, backups, exports,
   diagnostics, and CI evidence contain no credential or private content outside the
   explicitly encrypted/user-owned data archive.
8. The migration guide, recovery/rollback guide, compatibility matrix, support
   diagnostics, owner UX, and authoritative Lucidchart flow are synchronized.

## Revisit conditions

Reopen if the shared sync/export contracts gain an equivalent audited migration
primitive, organization adoption cannot be implemented safely across both targets,
the reference workload cannot complete within supported resource limits, or a future
multi-device authority model changes cutover semantics. Any change preserves
versioned compatibility, resume, recovery, and source ownership.

## References

- [Standalone-to-connected migration research](../research/2026-07-16-standalone-to-connected-migration-spike.md)
- [Offline synchronization protocol](../architecture/offline-sync-protocol.md)
- [Migration guide](../deployment/migration-guide.md)
- [ADR 0017: Windows native authentication and credential protection](0017-windows-native-authentication-and-credential-protection.md)
- [Windows-first client and Scout Bee design](../deployment/windows-first-client-and-scout-bee.md)
- [WIN-006](https://github.com/ApiaryLens/apiarylens/issues/9)
