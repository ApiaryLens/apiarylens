# Versioning, Release, and Update Lifecycle

## Status

Accepted and implemented MVP architecture. The required user outcomes and release
gates are part of the accepted
[MVP Definition and UAT Contract](../product/mvp-definition.md). Release manifests,
content-addressed bundles, contract and migration identity, keyless attestations,
backup-before-update, and direct recovery tooling are implemented. Scout Bee will
apply this lifecycle after its separate end-user release is ready.

## Purpose

ApiaryLens must be as easy to keep current as it is to install. A family or
hobbyist beekeeper should not need to understand container registries, database
migration tools, Cloudflare deployment internals, or Git tags to apply a supported
update safely.

The update design applies to:

- The installed PWA and its offline data
- The API and synchronization service
- Database schema and data migrations
- Media storage metadata and processing behavior
- The Cloudflare family profile
- Docker Compose on personally controlled hardware
- Docker Compose on a supported cloud Linux VM
- Scout Bee and its deployment-plan schema
- Public documentation, release notes, and compatibility information

An MVP that can be installed but cannot be safely updated is incomplete.

## User Promise

For every supported update, an operator can:

1. See the currently installed version and the available target version.
2. Read plain-language release notes, compatibility requirements, and known risks.
3. Verify prerequisites and available storage before making changes.
4. Create and verify a backup before a data-changing update.
5. Apply the update through a documented provider-specific procedure or, when it
   becomes available, Scout Bee.
6. Preserve pending offline inspections and media on client devices.
7. See migration and health-check progress without exposing secrets.
8. Confirm that the application, API, schema, and deployment profile are compatible.
9. Recover automatically or follow tested recovery steps if the update fails.
10. Export or restore owned data without depending on an ApiaryLens commercial
    service.

Updates must never silently discard accepted server data, pending offline work,
media, configuration, or credentials.

## Release Version Model

### Product Release

ApiaryLens uses one solution release version for the PWA, API, supported backend
profiles, Compose bundle, Cloudflare profile, Scout Bee compatibility data, and
release documentation. Semantic Versioning is the accepted public format:

- Stable release: `MAJOR.MINOR.PATCH`, tagged as `vMAJOR.MINOR.PATCH`
- Prerelease: `MAJOR.MINOR.PATCH-alpha.N`, `-beta.N`, or `-rc.N`
- Release-candidate UAT uses an explicit `-rc.N` tag

Public preview naming is decoupled from the wire version: public previews are
named **Preview N** (Public Preview 1, Preview 2, ...), while the semver
prerelease `0.1.0-preview.M` is an internal build ordinal that only ever
increases and may not match N — a build number consumed by an unpublished
internal draft is never reused (`preview.2` and `preview.3` were consumed this
way, so Preview 2 ships as build `0.1.0-preview.4`). Tags, manifests, and
artifact names always carry the exact semver build number; user-facing release
communication leads with the public preview name and states the build number.

Before `1.0.0`, a minor release may contain a breaking change only when the release
notes, migration path, compatibility window, and recovery procedure make that
change explicit. `1.0.0` establishes the first stable public compatibility
contract.

The solution version is the version a beekeeper sees. Internal packages may gain
independent versions later only if they are published and supported independently;
their versions must not replace or obscure the product release version.

### Build Identity

Every running deployment and installed PWA must expose a safe build identity that
includes:

- Product release version
- Source commit
- UTC build timestamp
- Release channel
- Deployment profile
- API contract major version
- Database migration head
- Synchronization protocol version
- Deployment-plan schema version
- Export format version
- Artifact digest or equivalent immutable identity where applicable

The PWA exposes this information in a **Version and Build** view. The server exposes
it through an authenticated system-information endpoint and a sanitized readiness
response. Diagnostics include it without including credentials or private
configuration.

### Independently Versioned Contracts

The following contracts evolve independently from the product version because each
has different compatibility rules:

| Contract | Identifier | Compatibility rule |
|---|---|---|
| Public API | `/api/v1` | Breaking HTTP contract changes require a new API major |
| Synchronization protocol | Integer or semantic contract version | Client and server declare a tested compatibility range |
| Database schema | Immutable ordered migration head | Released migrations are never edited or reordered |
| Deployment plan | `apiarylens.io/deployment/v1` | Breaking plan changes require a new schema major and migration guidance |
| Portable export | Named format plus version | New readers remain backward-compatible within the documented support window |

A product release manifest binds these contract versions to the exact product
release and artifacts.

## Release Channels and Promotion

The release channels are:

| Channel | Purpose | Promotion rule |
|---|---|---|
| Development | Continuous integration from `main` | Never presented as a stable user update |
| Preview | Ephemeral website or application review | Uses synthetic or isolated data only |
| Release candidate | Project-owner UAT and final verification | Explicit `-rc.N` version; no automatic stable promotion |
| Stable | Supported family and self-hosted release | Published only after all release gates pass |

Public demo and production deployments consume explicit release manifests. They do
not deploy arbitrary `main` commits. User deployments pin immutable artifact
digests or an equivalent provider revision recorded by the manifest; a mutable
`latest` label is never the only installed-version record.

## Release Manifest and Artifacts

Each release publishes a machine-readable manifest tying together:

- Product version and Git tag
- Source commit and build time
- PWA, API, worker, Scout Bee, and Compose artifact identities
- OCI image names, semantic tags, and immutable digests
- API, synchronization, deployment-plan, export, and migration versions
- Minimum directly supported upgrade version
- Compatibility and rollback window
- Checksums, signatures, SBOMs, and build provenance references
- Release-notes, changelog, migration, backup, and recovery-document references

MVP release artifacts include, as applicable:

- Source archives
- Versioned OCI images and Compose bundle
- Cloudflare deployment metadata
- Scout Bee build or distributable used by supported target adapters
- Database migration bundle and manifest
- OpenAPI document
- Deployment-plan JSON Schema
- Portable-export schema documentation
- SBOMs, signatures, checksums, and provenance
- Release notes, changelog, upgrade guide, compatibility matrix, and known issues

## Documentation Sources of Truth

Release communication is intentionally split by audience:

- `docs/releases/index.md` is the human-facing release index.
- `docs/releases/vMAJOR.MINOR.PATCH.md` contains curated release notes, upgrade
  impact, migrations, compatibility, fixes, known limitations, and recovery notes.
- The repository root `CHANGELOG.md` records developer-facing changes and is
  generated or release-managed from accepted change entries.
- `docs/roadmap/roadmap.md` remains the forward-looking product roadmap.
- `apiarylens.org` publishes release notes, downloads, changelog, roadmap, support
  windows, and user update instructions from those sources.
- `apiarylens.dev` publishes the OpenAPI contract, developer changelog, versioned
  schemas, compatibility policy, and integration migration guidance.
- The PWA links its exact build identity to the matching release notes.

Release pages must record the application version, API contract version, database
migration head, deployment artifacts, build/source identity, upgrade path, and
known limitations so a deployed build can always be traced to its documentation.

## Update Orchestration

Direct operator procedures provide the current update experience. Scout Bee will
provide the guided experience for its supported deployment targets after release;
the direct procedures remain documented so users are not locked into Scout Bee.

The shared update state machine is:

```text
Discover -> Review -> Preflight -> Back up -> Stage -> Migrate -> Activate ->
Verify -> Commit or recover
```

The implementation must persist enough non-secret state to resume safely after a
process, browser, host, or network interruption. Re-running an update is
idempotent. Logs and diagnostics identify the step and version without revealing
secrets.

### Discovery and Preflight

Before changing the deployment, the updater verifies:

- Installed and target release identities
- Supported direct-upgrade path and contract compatibility
- Host, runtime, account, quota, storage, and network prerequisites
- Current deployment health and unfinished prior operations
- Backup destination and available capacity
- Required secret references without reading them into logs or the deployment plan
- Pending or incompatible client state that requires a user-visible warning
- Artifact checksums, signatures, provenance, and allowed release channel

### Backup and Restore Point

Every data-changing update creates or verifies a recoverable, version-labeled
restore point covering database data, media, required configuration references,
and the installed release manifest. Backup verification is more than successful
file creation: automated checks confirm readability, expected contents, and
restore metadata.

Secrets are not copied into portable exports or diagnostic bundles. Any deployment
secret backup uses the documented secure platform mechanism and is clearly
distinguished from user-data backup.

### Database and Contract Migrations

- Migrations are immutable, ordered, repeat-safe where practical, and tested from
  every directly supported prior release.
- Destructive schema changes use an expand-and-contract sequence or another
  documented compatibility window.
- The prior application release remains compatible with the migrated schema for at
  least the documented rollback window whenever technically practical.
- An irreversible migration requires an explicit warning and a verified restore
  point; application rollback alone must not be represented as full rollback.
- Failed or partial migrations stop activation and produce recovery guidance.
- Export-format and deployment-plan migrations are tested alongside data migrations.

### Activation and Verification

Activation is complete only after:

- Liveness and readiness checks pass
- The expected product, API, schema, sync, and deployment versions agree
- Authentication and organization isolation smoke tests pass
- A representative read and write pass without data loss
- Media read/write verification passes
- Synchronization compatibility is confirmed
- Background work is healthy
- Public routes, TLS, security headers, and expected exposure mode are correct
- The PWA can discover the compatible backend release

The installed release manifest is committed only after verification succeeds.

## Deployment-Profile Behavior

### Cloudflare Family Profile

The Cloudflare update path must:

1. Validate account, quota, binding, route, and secret prerequisites.
2. Create or verify the profile's database and media restore point or export.
3. Upload or stage the exact release-candidate or stable revision.
4. Apply compatible D1 or selected relational migrations in the documented order.
5. Deploy worker and PWA assets without leaving mixed incompatible versions.
6. Run profile conformance and health checks.
7. Promote the verified revision, or return to the previous provider revision and
   invoke restore guidance when schema recovery is required.

Provider revision history is useful but does not replace ApiaryLens data backup,
schema compatibility, or portable export.

### Docker Compose on Owned Hardware or a Cloud VM

The Compose update path must:

1. Verify the host and current Compose deployment.
2. Back up database, media, configuration references, and release metadata.
3. Pull the exact signed images pinned by release version and digest.
4. Run migrations through a dedicated, observable step.
5. Recreate services with persistent data preserved.
6. Wait for health and conformance checks.
7. Retain the immediately previous compatible images and manifest for the rollback
   window.
8. Restore the previous application version or the verified restore point when
   required.

The same versioned Compose bundle and lifecycle apply to a supported local Linux
host, Hyper-V Linux VM, Azure VM, AWS VM, or GCP VM. Provider instructions may add
provisioning or snapshot steps but may not fork the product release.

### PWA and Offline Data

The service worker may discover an application update automatically, but it must
not force a reload that could discard an in-progress inspection or pending media.
The PWA must:

- Show the installed client version and compatible server version
- Download and verify new static assets without activating an incompatible client
- Warn when the client is outside the server's supported compatibility range
- Defer activation while an inspection is being edited or a local migration cannot
  complete safely
- Preserve the local record store and pending synchronization queue
- Run versioned local-store migrations with recovery behavior
- Offer a clear **Update now** or **Update when safe** interaction
- Explain when a full refresh, sign-in, export, or administrator update is required

Offline-capable clients remain usable within their documented compatibility window.
The server must not strand a device that was offline during a routine compatible
update.

## Failure, Rollback, and Recovery

Rollback has two meanings and the product must distinguish them:

- **Application rollback:** return executable artifacts or provider revisions to a
  previous compatible version while retaining the current schema.
- **Full restore:** restore data, media, and release metadata to the verified
  pre-update restore point when an incompatible or irreversible change requires it.

An automatic rollback is attempted when activation or verification fails and the
schema remains compatible. When automatic recovery is unsafe, the deployment stays
in a clearly reported maintenance or degraded state and presents the tested restore
procedure. Scout Bee never repeatedly retries a destructive step without an
idempotency guarantee.

Recovery instructions must identify data-loss boundaries honestly. If restoring a
pre-update backup could discard writes made after that backup, the operator sees
that warning before continuing.

## Support and Security Policy

The project publishes:

- Supported release and direct-upgrade windows
- Security-fix and end-of-support expectations
- Minimum Scout Bee version for each target release
- Browser/PWA and server compatibility matrix
- Known migration and rollback limitations
- Release-signing verification and compromise-recovery procedures
- How maintainers communicate revoked or vulnerable artifacts

ApiaryLens does not silently self-update a user-controlled server. Update discovery
may be enabled, but downloading, migrating, or activating a server release requires
explicit operator action unless the operator deliberately configures a documented
automatic-update policy after MVP.

Official artifacts use the keyless repository workflow accepted in
[ADR 0013](../adr/0013-keyless-release-signing.md). Verification pins the public
repository, exact signer workflow, source ref, and artifact digest; a checksum or
attestation from an arbitrary fork is not an official ApiaryLens release identity.

## MVP Acceptance Requirements

Before the MVP is releasable:

- A release candidate has a complete release manifest and exact build identity.
- The PWA, API, Scout Bee, Cloudflare profile, and Compose profile report compatible
  version information.
- Release notes, changelog, upgrade guidance, support window, compatibility matrix,
  and recovery instructions are published.
- A clean installation and a supported upgrade from the previous release candidate
  or seeded predecessor both pass on the Hyper-V Compose target and Cloudflare
  family profile.
- The same Compose upgrade is verified on the supported cloud-VM reference path.
- Backup-before-update and clean-environment restore are verified.
- An interrupted or failed update demonstrates resume, application rollback, or
  full-restore recovery as appropriate.
- A PWA with pending offline inspection data survives a client and compatible
  server update and synchronizes exactly once afterward.
- UAT can trace the running build to its commit, artifacts, migrations, API
  contract, release notes, and known limitations.

The first release may use a seeded predecessor or earlier release candidate to
prove the update machinery; the absence of a public prior stable release does not
waive the update test.

## Required Research and ADRs

The independent product/client/Scout version and compatibility decision is proposed
in ADR 0021, part of the ApiaryLens design record (private, see
[docs/RELOCATED.md](../RELOCATED.md)).

- Product-version source of truth and release-manifest schema
- Release automation, change-entry, changelog, and documentation publishing tools
- API, synchronization, local-store, export, and deployment-plan compatibility
- Database migration framework and rollback window
- PWA service-worker activation and local-store migration behavior
- Artifact registry, signing, checksum, SBOM, and provenance implementation
- Cloudflare staging, database backup/export, migration, promotion, and recovery
- Compose image pinning, backup, migration, health, and rollback implementation
- Scout Bee update discovery, trust, privileged execution, resume, and recovery
- Support window, notification behavior, and optional post-MVP automatic updates

The detailed design must include Lucidchart sources and accessible public exports
for release promotion, the shared update state machine, Cloudflare update and
recovery, Compose update and recovery, PWA activation with pending offline work,
and backup/restore trust boundaries. These diagrams belong in the dedicated
`ApiaryLens` Lucid folder and the public diagram catalog.

## Related Documents

- [MVP Definition and UAT Contract](../product/mvp-definition.md)
- Master Architecture and Design Plan — in the ApiaryLens design record (private, see [docs/RELOCATED.md](../RELOCATED.md))
- [Installation and Deployment Experience](installation-and-deployment-experience.md)
- [Deployment Strategy](../deployment/deployment-strategy.md)
- [Deployment, PWA, and Cost Test Strategy](../testing/deployment-test-strategy.md)
- [Security Architecture](../security/security-architecture.md)
- [Roadmap](../roadmap/roadmap.md)
