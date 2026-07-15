# Operational Architecture and Journeys

The editable sources for this seven-page set are the cataloged Lucidchart documents
in the dedicated `ApiaryLens` folder. Four pages remain in document
`72787958-9344-4a71-af56-98a216b35aa1`; the final-polish component and update pages
are in `f22ae65e-c353-488e-ba54-51f7de4c189c`, and authorization is in
`97b127d3-5a52-4232-bf90-99e59966d987`. The descriptions below are the accessible
text alternative and define the intended reading order.

## Components and Network Trust

![ApiaryLens family devices connect over TLS to PWA assets and the portable API inside the public HTTPS boundary; only the API reaches the private database and media boundary](../../assets/graphics/architecture/components-network-trust.png)

Family devices install the PWA and use TLS, secure cookies, CSRF protection, and
JSON requests. Static assets and the portable API sit inside the public HTTPS
boundary. Only organization-scoped API queries reach SQLite, and only authorized
media operations reach originals and thumbnails in private storage.

## Authorization Boundaries

![Every request must pass opaque-session, role-permission, and organization-ownership checks before an action is performed; any failed check denies without disclosing data](../../assets/graphics/architecture/authorization-boundaries.png)

Authorization is a three-gate server decision: authenticate the opaque session,
authorize the role action, and verify object ownership by the session organization.
Failure at any gate returns a denial without revealing whether another family's
object exists.

## Media, Backup, and Restore

![Photos are staged as originals and thumbnails in IndexedDB before authenticated retryable upload; backups protect writes, archive records and media, and are accepted only after digest and restore tests](../../assets/graphics/architecture/media-backup-restore.png)

Media remains available offline because the original and thumbnail are staged
before upload. Backup acceptance is separate: protect writes, snapshot release
identity, create the versioned records-and-media archive, and reject it unless both
integrity validation and a restore test pass.

## Scout Bee Executor

![Scout Bee keeps its React interface, secret-free plan, Go executor, and redacted diagnostics inside a loopback-only boundary, then verifies release artifacts before operating user-owned Cloudflare or Linux Compose targets](../../assets/graphics/architecture/scout-bee-executor.png)

Scout Bee binds only to loopback. The plan is shareable because it contains no
runtime credentials. The executor validates compatibility and artifact digests,
then applies allow-listed operations to Cloudflare or to Linux over pinned SSH.

## CI/CD and Release Promotion

![A reviewed source commit passes formatting, type, test, security, license, documentation, reproducible-build, SBOM, provenance, and isolated UAT gates before a signed stable release can be promoted](../../assets/graphics/architecture/cicd-release-promotion.png)

Promotion is gated, not calendar-driven. A failed P0 requirement or missing owner
approval stops promotion and becomes a recorded release limitation.

## Update, Rollback, and Recovery

![An update waits for pending PWA work, verifies compatibility and backup, applies migrations and an immutable revision, then either completes after health checks, rolls application code back when compatible, or performs a full restore](../../assets/graphics/architecture/update-rollback-recovery.png)

Pending device work prevents activation. After deployment, a failing health/UAT
smoke test branches on migration compatibility: compatible migrations permit code
rollback; incompatible or partial migrations require stopping writes and restoring
the complete pre-update backup.

## Primary MVP User Journeys

![The primary journey moves from install and family onboarding through apiary setup, offline inspection, synchronization, care history, export, backup, update, and recovery, with a separate viewer path whose writes are denied by the server](../../assets/graphics/architecture/primary-user-journeys.png)

The main journey spans ownership, field work, shared care, and recovery. The viewer
branch makes negative authorization explicit: read access never implies a client or
server write capability.
