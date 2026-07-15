# Application Platform and Storage Research Spike

## Status

Decision evidence complete on 2026-07-15. Runtime measurements are updated in this
document as the implementation passes its Cloudflare and Compose acceptance tests.

## Question

Which small, open-source application and storage design can implement the same
offline-first product on Cloudflare and personally controlled hardware without
making either path second-class?

## Family Reference Workload

The MVP capacity model uses five family members, 50 hives, two inspections per hive
per month during eight active months, 25 structured changes and four optimized
photos per inspection, 24 months of relational history, and 12 months of online
media with older media exportable to a user archive. A photo target of 1.5 MiB
produces roughly 7.7 GiB over two active years before retention/export choices.

The model is deliberately above the first UAT family's likely two-hive use. It is a
capacity envelope, not a promise that provider allowances never change.

## Primary Evidence

| Area | Dated finding | Design effect |
|---|---|---|
| Workers Free | 100,000 requests/day, 10 ms CPU/request, 128 MiB memory, and 50 subrequests were documented when checked | Keep requests short, benchmark password hashing, batch sync, and reject unbounded work |
| D1 Free | 5 million rows read/day, 100,000 rows written/day, 5 GB account storage, 500 MB per database, 10 databases, and 50 queries per Worker invocation were documented | Relational family workload fits; media never belongs in D1; migrations and sync use bounded batches |
| R2 Free | 10 GB-month standard storage, 1 million Class A and 10 million Class B operations/month, with free internet egress, were documented | The reference photo workload can fit initially, but the UI needs quota visibility and export/retention controls |
| D1 recovery | Time Travel provides point-in-time recovery and export/import support | Use it for provider recovery, plus user-owned portable export and media backup |
| Node SQLite | Node 24 exposes a built-in SQLite module and backup API | Compose can ship one application container without a database service |
| SQLite WAL | WAL is persistent state and unsafe main-file-only copies can omit committed transactions | Use backup/checkpoint procedures and validate restore |
| Hono | Official adapters target Cloudflare Workers and Node using Web Standards | Share API routes and contracts while isolating storage/runtime adapters |
| Browser storage | IndexedDB is the durable browser database primitive; persistent-storage requests and quotas vary by browser | Use IndexedDB as a replica/outbox, expose durability state, and keep server/export backups |

Sources were checked on 2026-07-15:

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [Hono](https://hono.dev/docs/)
- [Dexie](https://dexie.org/docs/)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

## Options

### Separate Cloudflare and Compose applications

This makes each runtime locally idiomatic but doubles domain behavior,
authorization, migrations, sync semantics, and testing. Rejected.

### TypeScript API with PostgreSQL everywhere

PostgreSQL is mature and appropriate for large deployments, but it does not run as
D1 and adds a service, memory, credentials, upgrades, and backup coordination to a
small self-hosted installation. It remains a future adapter. Rejected for MVP.

### Shared TypeScript contracts with SQLite-family adapters

Hono runs on Worker and Node; D1 and `node:sqlite` share SQLite semantics; a small
adapter surface can contain differences. This is the smallest design that preserves
shared behavior. Selected.

## Initial Capacity Calculation

The structured workload is approximately 20,000 inspection-related writes per
active year before sync/audit amplification. Even a conservative tenfold
amplification remains far below the documented daily write allowance when spread
across the season. Normal dashboard reads require summaries and bounded pages so
they do not scan entire histories.

Photos, not rows, define the free capacity edge. The reference estimate approaches
the current R2 free storage allowance after two active years. ApiaryLens therefore
shows storage use, generates thumbnails, allows original-quality configuration,
supports complete export, and warns before quota exhaustion. It never deletes user
media silently or assumes the allowance is permanent.

## Acceptance Gates

- The same API conformance suite passes on D1 and Node SQLite.
- PBKDF2 login completes at the Worker-compatible, versioned 100,000-round parameter
  with acceptable end-to-end latency; the security record preserves the preferred
  higher target and the post-MVP memory-hard upgrade requirement.
- A 500-operation sync batch stays within query and CPU limits or is split safely.
- Fresh Compose runs within 512 MiB RAM at idle and remains usable on one vCPU.
- Cloudflare reference activity remains within documented free allowances with
  warnings and read-only/recovery behavior before hard limits.
- Export from one profile restores into the other with matching row/media hashes.
- No test or production path requires HCS infrastructure.

## Decision

Adopt ADR 0008 and ADR 0009. Publish measurements and cost assumptions with each
release rather than advertising permanent free hosting.
