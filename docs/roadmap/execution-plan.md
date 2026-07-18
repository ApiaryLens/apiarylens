# ApiaryLens Execution Plan

## Status

Active Public Preview 1 delivery sequence. Preview 1 is not GA or a stable release:
features and workflows may change, updates may arrive frequently (sometimes multiple
times per day), and preview users must keep backups and exports rather than relying
on ApiaryLens as the sole copy of irreplaceable records or media. The Master
Architecture and Design Plan — in the ApiaryLens design record (private, see
[docs/RELOCATED.md](../RELOCATED.md)) —
remains authoritative for product architecture; this document controls the order in
which the portfolio moves from foundation through release.

## Progress

- Architecture, research, ADRs, security model, and MVP/UAT contract: accepted
  2026-07-15
- Six-repository portfolio and independently deployed public frontends: complete
- PWA, Node and Cloudflare backends, shared SQLite contracts, and Compose:
  published for Preview evaluation
- Content-addressed Preview artifacts, checksums, and attestations: published
- MVP core implementation: Cloudflare family profile, approved Hyper-V Compose
  profile, documentation, and release artifacts are available in Public Preview 1.
- Post-MVP Version 1.1 backlog: AWS/provider expansion, the extended physical
  assistive-technology support matrix, and broader operational polish.
- The standalone Windows application and separately released Scout Bee remain active
  future work and are not current end-user downloads.

## Delivery Rule

ApiaryLens follows a gated sequence:

```text
Foundation -> Discovery and research -> Decisions -> Detailed design ->
Implementation -> Verification -> Deployment and release -> Operate and learn
```

Work may proceed in parallel when its inputs are stable, but dependent code does not
start before the required research, ADRs, security analysis, and contracts are
accepted. Documentation is updated with each accepted decision; it is not postponed
until after implementation.

## Stage 0: Portfolio Foundation

Outcomes:

- Reconcile the master plan, accepted ADRs, supporting designs, roadmap, and tasks.
- Activate and clone `apiarylens`, `apiarylens-ops`, `apiarylens.org`,
  `apiarylens.app`, `apiarylens.dev`, and `.github`.
- Give every repository a clear responsibility, source-of-truth boundary, agent
  guidance, contribution/security baseline, and initial directory structure.
- Establish Cloudflare Workers Static Assets as the deployment convention for all
  official public frontends without selecting an unreviewed frontend framework.
- Create the dedicated Lucid `ApiaryLens` folder and diagram catalog.
- Choose the open-source license and accept the open-source/self-hosted ADR.

Exit gate:

- The repository portfolio exists, is locally cloned, has no source-of-truth
  ambiguity, and passes baseline repository checks.

## Stage 1: Discovery and Research

Run time-boxed, evidence-producing spikes for material unknowns:

- Beekeeper workflows, MVP jobs, terminology, accessibility, and outdoor use
- Device-local PWA storage, durability, backup, and migration into synchronization
- Frontend/PWA framework and offline persistence
- Backend framework and API approach
- Database, media storage, and small-footprint deployment
- Synchronization, conflict resolution, and multi-device behavior
- Authentication, authorization, OIDC, recovery, and offline sessions
- Local-network HTTPS and deployment discovery
- `Scout Bee` packaging, privileges, updates, signing, and rollback
- Product version source of truth, release manifest, contract compatibility,
  database and PWA migrations, release promotion, and recovery
- Cloudflare-first family cloud deployment and Compose-on-VM fallback evaluation
  without changing the portable core
- Public `.org`, `.app`, and `.dev` information architecture and Cloudflare build
  requirements

Exit gate:

- Each spike has dated primary evidence, measured results where applicable, a
  recommendation, risks, rejected alternatives, and the ADRs it requires.

## Stage 2: Architecture Decisions

Accept the minimum durable decisions required for implementation, including:

- License and open-source posture
- Frontend/PWA and offline storage
- Backend, database, migrations, and data access
- Identity, authorization, organization isolation, and sharing
- Synchronization and conflict resolution
- Media storage and processing
- API/OpenAPI and client generation
- Compose, secrets, HTTPS, backups, upgrades, and release integrity
- Product version, build identity, release manifest, channels, API/sync/schema/export
  compatibility, PWA activation, and supported update/recovery windows
- Cloudflare-native runtime, D1/R2 adapters, quota behavior, backup, export, and
  migration for the first cloud profile
- Cloudflare frontend framework/build conventions for each public property

Each accepted ADR updates the master architecture and any affected supporting
documents in the same change.

Exit gate:

- No implementation-critical decision is merely implied by a task, prototype, or
  dependency already installed.

## Stage 3: Detailed Design and Planning

Produce:

- Lucid system context, trust boundary, component, deployment, data, sync, identity,
  repository, and delivery-flow diagrams with accessible public exports
- Product requirements and scoped MVP specification
- Domain and data model
- API, synchronization, media, identity, deployment-plan, and connection contracts
- Version, release manifest, artifact promotion, migration, update, rollback, restore,
  and support-lifecycle contracts
- Threat model, ASVS mapping, privacy analysis, and release-security design
- UX flows and accessible design-system foundation
- Test strategy, acceptance journeys, capacity assumptions, cost model, and rollback
  plans
- Ordered implementation epics and tasks with explicit dependencies

Exit gate:

- A contributor can implement the first vertical slice without inventing unresolved
  architecture in code.

## Stage 4: Product and Website Implementation

Build in thin, deployable vertical slices:

1. PWA shell, local data, accessibility, and offline state
2. Core API, database, identity, organizations, apiaries, and hives
3. Synchronization across a family deployment
4. Inspection and media workflows
5. Compose packaging, backup, restore, versioned update, recovery, and diagnostics
   for owned hardware
6. Cloudflare-native family deployment, versioned update and recovery, with
   Compose-on-VM cloud conformance
7. Scout Bee guided deployment and update orchestration
8. Cloudflare-hosted `.org`, `.app`, and `.dev` frontends consuming authoritative
   content and versioned product artifacts
9. Safe public demo and measured family-cloud reference profile

Every slice includes tests, security controls, migration behavior, documentation,
and deployment support rather than treating them as later cleanup.

## Stage 5: Verification, Release, and Operation

- Exercise local, Hyper-V, Cloudflare-style, Azure-style, and provider-neutral test
  environments without making maintainer infrastructure a product dependency.
- Verify real iPhone, iPad, and desktop PWA journeys, offline recovery, sync,
  authorization isolation, upgrades, backup/restore, and cost limits.
- Generate SBOMs, signatures, checksums, provenance, release notes, changelog,
  downloads, and versioned documentation.
- Verify exact build identity, release-manifest traceability, upgrade from a seeded
  predecessor or supported prior release, PWA pending-work preservation, failed
  update recovery, and cross-profile compatibility.
- Deploy public frontends through reviewed Cloudflare preview and production gates.
- Publish support boundaries, known limitations, security-fix policy, and operator
  runbooks.
- Feed production and community learning back into research, ADRs, roadmap, and
  implementation without bypassing the same governance loop.

## Immediate Work Queue

1. Complete and obtain project-owner approval of the detailed Windows-first/Scout
   project plan, HeritageVA-style live dashboard, ADR 0014/0015 direction, and open
   repository decisions. Product code and repository migration remain unauthorized
   until that gate closes.
2. Execute the Windows-first/Scout research program and accept the host, embedded
   service, native authentication, migration, shared-client, and update ADRs before
   framework-dependent implementation.
3. Create the separate Scout Bee repository and independently versioned release
   pipeline without allowing core workflows to deploy user environments.
4. Convert the Public Preview owner-feedback backlog into shared-client slices,
   starting with automatic online/reconnect synchronization, installed-client
   offline launch, update notification, member administration, and backup/restore.
5. Prove pending inspection/media work survives the released PWA/server update and
   synchronizes exactly once on the required MVP profiles.
6. Complete the intelligent-field and queen-identifier terminology discovery before
   changing stored values or UI controls.
7. Track AWS, extended physical-device sessions, assistive-technology review, and
   formal support operations in the Version 1.1 backlog.
8. Record project-owner acceptance only after the remaining GA gates close; do not
   promote Preview 1 directly to stable merely because the preview is available.
