# ApiaryLens Master Architecture and Design Plan

## Document Status

**Status:** Living master plan

**Last updated:** 2026-07-15

This is the authoritative entry point for ApiaryLens product architecture and
design. It records the current system shape, accepted decisions, active direction,
open questions, decision process, and links to detailed source documents.

This document does not replace ADRs. ADRs explain why durable decisions were made;
this plan is updated after an ADR is accepted so it always describes the assembled
current architecture. Imported documents under `docs/source-documents/` preserve
project history and are not authoritative when they conflict with this plan or an
accepted ADR.

## Purpose and Scope

ApiaryLens is an open-source, self-hosted apiary intelligence and hive management
platform. It must serve a new beekeeper with one hive, families and mentors, bee
clubs, extension offices, researchers, and commercial operations without requiring
different products or a cloud service.

This plan governs:

- The open-source product and self-hosted deployment
- Offline PWA behavior and synchronization
- APIs, data, identity, authorization, media, background work, and integrations
- Public project, application, and developer properties
- Product versioning, release artifacts, updates, migrations, recovery, and support
- Future optional hosted-service architecture
- Community galleries and registries
- Architecture research, ADRs, documentation, and repository boundaries

## Decision Authority

When documents disagree, use this order:

1. Non-negotiable principles in [`AGENTS.md`](../../AGENTS.md)
2. Accepted ADRs under [`docs/adr/`](../adr/)
3. This master plan
4. Focused architecture, security, deployment, and research documents
5. Roadmaps and task plans
6. Imported source documents and historical handoff material

An accepted ADR that changes the architecture must update this master plan in the
same change. A proposed ADR documents an option under review and does not override
the current plan.

## Product and Architecture Principles

- **Open source first:** the core platform and self-hosted path remain open.
- **Self-hosted first:** core operation requires no cloud service or third-party account.
- **Offline-first PWA:** field workflows remain usable without connectivity and sync later.
- **Privacy-first:** no telemetry or data egress by default; publishing and external providers are opt-in.
- **Secure by exposure:** device-only use may omit an application password, but
  every LAN, tunnel, VPN, or internet-reachable deployment requires authentication
  and encrypted transport; internet-facing access requires normal publicly trusted
  HTTPS.
- **AI-assisted, not AI-required:** AI can be disabled without reducing core hive-management capability.
- **SaaS-capable later:** an optional hosted offering may use the same product, but self-hosting remains first-class.
- **Portable data:** users can export and move their data and media.
- **Scale without a rewrite:** organizations, permissions, storage, and workflows must support one hive through commercial operations.
- **Outdoor usability:** mobile interaction, touch targets, contrast, speed, and intermittent connectivity are primary constraints.
- **Accessible:** interfaces and published sites should target WCAG 2.1 AA or better.
- **Portable brand assets:** official graphics are committed, versioned build inputs;
  no private creative studio is required to build or run ApiaryLens.
- **Near-free family cloud:** the project must pursue an always-available,
  synchronized family profile with no license cost and zero or predictably minimal
  hosting cost, without promising that a third-party free tier will remain free.
- **Easy to start and operate:** a family or hobbyist must not need database,
  container, DNS, TLS, identity-provider, or cloud-billing expertise to begin.
- **Safe to keep current:** every supported profile has a traceable, guided,
  backup-first update and tested recovery path that preserves offline work.
- **Tiered without editions:** personal, family, and organization footprints use the
  same core product, contracts, and portable data formats.
- **Documented before implementation:** meaningful architecture decisions are reviewed and recorded before dependent code is built.

## Current Project State

The repository is a foundation scaffold. There is no application, API, database,
container image, or working Compose deployment yet. Technology selections listed
below are direction or candidates until accepted through ADRs.

Accepted decisions:

- [ADR 0001: Core Monorepo with Separate Properties and Operations](../adr/0001-project-structure.md)
- [ADR 0002: Domain Strategy](../adr/0002-domain-strategy.md)
- [ADR 0003: Open Source and Self-Hosted First](../adr/0003-open-source-first.md)
- [ADR 0004: Lucidchart Diagram Standard](../adr/0004-lucidchart-diagram-standard.md)
- [ADR 0005: Activate the Initial Repository Portfolio](../adr/0005-initial-repository-portfolio.md)
- [ADR 0006: Cloudflare Hosting for Public Frontends](../adr/0006-cloudflare-public-frontends.md)
- [ADR 0007: Deployment Profile Priority](../adr/0007-deployment-profile-priority.md)

Accepted product-scope decision:

- [ApiaryLens MVP Definition and UAT Contract](../product/mvp-definition.md)

The open-source, self-hosted, offline-first, privacy-first, and optional-AI
constraints are mandatory through `AGENTS.md` and accepted ADR 0003. The public
product uses Apache License 2.0 and DCO 1.1 contribution sign-off.

## System Context

The system serves beekeepers, families, mentors, clubs, staff, and researchers
through an offline-capable PWA. The PWA may operate device-locally for personal use
or synchronize through the backend API. The backend coordinates relational data,
media storage, background work, and optional provider adapters for weather, bloom,
sensors, storage, identity, and AI.

The authoritative system-context diagram will be created in the dedicated
ApiaryLens Lucid folder and cataloged in [`docs/diagrams/README.md`](../diagrams/README.md).

The PWA communicates with the API when online but is not merely an online view of
server state. It requires an explicit local data model, mutation queue,
synchronization protocol, conflict behavior, and media retry lifecycle. Those
mechanisms remain open decisions and require research before implementation.

## Supported Operating Models

The MVP is designed first for family and hobbyist beekeepers. ApiaryLens uses
capability tiers rather than separate product editions:

| Tier | Intended footprint | Direction |
|---|---|---|
| Personal | Device-local PWA with no required server or account | Post-MVP P1 research priority |
| Family | Always-available synchronization through a small local or near-free cloud deployment | Primary product outcome after sync and cost research |
| Organization | Always-on deployment for clubs, commercial operations, extension offices, and research | Later roadmap |

Delivery experiences include a public demo, a later installable device-only personal
PWA, completed MVP `Scout Bee` deployment, Docker Compose, a Cloudflare-native family cloud,
provider-neutral VM deployment, later cloud templates, and an optional future
managed service. Docker Compose is the first complete server target on personally
controlled hardware. Cloudflare is the first cloud profile target; Compose on an
ordinary Linux VM is the second. All consume the same core product and portable data
contracts.

See
[Installation and Deployment Experience](installation-and-deployment-experience.md).

## Repository Architecture

Repository boundaries follow ownership, visibility, deployment, release cadence,
and contribution model—not domain ownership alone.

| Repository | Visibility | Responsibility | Activation |
|---|---|---|---|
| `apiarylens` | Public | Product monorepo: PWA, API, worker, packages, database, Compose, architecture, ADRs | Active |
| `apiarylens-ops` | Private | Internal planning, dashboards, coordination, and operational procedures | Active |
| `apiarylens.org` | Private | Marketing, public docs experience, tutorials, releases, roadmap, and community | Active foundation scaffold |
| `apiarylens.app` | Private | Public demo deployment, safe seed data, and hosted-app configuration | Active foundation scaffold |
| `apiarylens.dev` | Private | Developer portal, generated API reference, integrations, SDKs, plugins, contributor material | Active foundation scaffold |
| `.github` | Private | Internal organization configuration, reference templates, and private-repository workflow sources | Active |

The main `apiarylens` repository remains authoritative for product behavior,
contracts, self-hosted deployment, and releases. Domain repositories consume
versioned artifacts or generated documentation; they do not copy or fork the
product implementation. Repository visibility and deployment visibility are
separate: the `.org`, `.app`, and `.dev` sites are public properties deployed from
private repositories. The core open-source repository is the only public repository
in the initial portfolio. It also carries its own public community-health files and
issue templates because GitHub does not inherit them from a private `.github`
repository.

Future production SaaS infrastructure may require a private `apiarylens-cloud` or
`apiarylens-infrastructure` repository. The private `apiarylens-ops` repository must
not become an unstructured substitute for production infrastructure.

See [Repository Strategy](repository-strategy.md) and
[ADR 0001](../adr/0001-project-structure.md). The activation timing and initial
scaffold are accepted in [ADR 0005](../adr/0005-initial-repository-portfolio.md).

## Domain Architecture

| Domain | Durable purpose |
|---|---|
| `apiarylens.org` | Public project, marketing, documentation, tutorials, videos, downloads, releases, changelog, roadmap, community, and self-hosting |
| `apiarylens.app` | Interactive demo and hosted application; optional SaaS later |
| `apiarylens.dev` | Developer portal, APIs, integrations, SDKs, plugins, architecture, contributor resources, and development tooling |
| `apiarylens.com` | Reserved for future commercial or company use; redirects to `.org` for now |

Each domain keeps the same meaning as the project grows. See
[ADR 0002](../adr/0002-domain-strategy.md) for the accepted decision.

## Public Frontend Hosting

All official `apiarylens.org`, `apiarylens.app`, and `apiarylens.dev` frontends use
Cloudflare. New projects target Workers Static Assets with custom domains, managed
TLS, caching, security headers, and reviewed preview/production workflows. The
current `apiarylens.com` redirect to `.org` is also implemented on Cloudflare.

This accepted frontend-hosting boundary does not by itself select the frontend
framework or backend services. [ADR 0007](../adr/0007-deployment-profile-priority.md)
separately makes a Cloudflare-native family backend the first cloud target while
preserving portable self-hosted, Compose-on-VM, demo, and future managed backends.
A self-hoster requires no Cloudflare account.

See [ADR 0006](../adr/0006-cloudflare-public-frontends.md) and
[Task 009](../../tasks/009-establish-cloudflare-frontend-foundation.md).

## Diagram and Flowchart Standard

Lucidchart is the editable source of truth for all new or substantially revised
ApiaryLens architecture diagrams, data diagrams, and flowcharts. All documents must
live in a dedicated Lucid folder named `ApiaryLens` and be cataloged in
[`docs/diagrams/README.md`](../diagrams/README.md).

Public documentation must include an accessible SVG or PNG export plus explanatory
Markdown so understanding the open-source architecture does not require a Lucid
account. Existing Mermaid material is legacy migration input rather than the future
authoring standard.

The connected Lucid MCP is available for document operations but currently does not
expose folder creation. The folder is therefore a pending workspace setup action.
See [ADR 0004](../adr/0004-lucidchart-diagram-standard.md).

## Application Architecture

The core product is expected to contain these logical components. Their framework
and packaging boundaries are not yet final.

### Web PWA

Responsibilities:

- Installable, responsive application shell
- Supported experience on iPhone, iPad, laptop, and desktop browsers
- Researched device-local personal mode without a required backend account
- Offline read and write workflows
- Local persistence, mutation queue, and synchronization state
- Fast inspection capture, photos, QR entry, and field-safe interaction
- Simple workflows for new beekeepers and efficient workflows for larger operations
- Clear indication of offline, pending, conflicted, and synchronized state
- Same family record available across authorized devices after synchronization

The device-local storage engine, durability guarantees, backup experience, and
transition into family synchronization are open research questions. Browser storage
must not become the only durable copy without explicit persistence and backup
behavior.

Current direction, not accepted stack:

- React, TypeScript, and Vite
- PWA first; committed iPhone App Store client later
- Capacitor, another wrapper, or a native implementation selected through research and ADR
- IndexedDB and/or SQLite-backed local persistence
- MapLibre for maps
- A suitable accessible charting library for trends

### iPhone App Store Client

An iPhone application users can download from the Apple App Store is a committed
later roadmap direction. It connects to a user's chosen compatible ApiaryLens
deployment, including self-hosted servers, the near-free family cloud reference, or
a future managed ApiaryLens service.

The iPhone client must reuse the public authentication, API, synchronization, media,
and data-portability contracts. It must not require an Apple-only backend, iCloud,
or the future ApiaryLens SaaS. Deployment connection and onboarding should support a
plain server URL plus a safe guided mechanism such as a QR code or connection file,
subject to security research.

The PWA remains the first implementation and proves the mobile workflows. Research
and an ADR will decide whether the App Store client uses Capacitor, another thin
wrapper, or native code. The decision must address offline storage, background
synchronization, camera and media access, notifications, TLS and self-hosted server
trust, accessibility, App Store privacy disclosures, signing, updates, and long-term
maintenance.

The Apple developer account, signing identities, certificates, and release
automation are private maintainer operations. They are not requirements for
self-hosting or building the open-source server.

### Backend API

Responsibilities:

- Versioned REST API and OpenAPI contract
- Authentication, authorization, organizations, memberships, and roles
- Domain operations for apiaries, hives, inspections, queens, equipment, media, weather, bloom, and harvests
- Synchronization endpoints with idempotency and explicit conflict behavior
- Export, portability, and administrative operations
- Provider abstractions rather than hard-coded SaaS dependencies

Candidate frameworks remain FastAPI and NestJS. A research comparison and ADR are
required before installation or scaffolding.

### Background Worker

Responsibilities may include:

- Weather and bloom synchronization
- Media processing
- Export generation
- Notifications and scheduled work
- Optional AI analysis
- Retryable integration tasks

The queue, scheduler, delivery guarantees, retry policy, and packaging remain open.

### Data Store

PostgreSQL is the current portable server direction, not yet an accepted decision.
D1 is the expected relational candidate for the Cloudflare-first family profile,
also not yet accepted. The design must define shared data contracts, adapter
boundaries, migrations, backup and restore, organization isolation, auditing,
conformance tests, data export, and migration between profiles without assuming the
two databases are directly interchangeable.

Initial domain concepts include:

- Organization, User, Membership, and Role
- Apiary, Hive, HiveComponent, Box, and Frame
- Queen and queen history
- Inspection and InspectionObservation
- MiteCount, DiseaseObservation, Treatment, and Feeding
- Harvest
- MediaAsset and optional AIReview
- WeatherRecord, BloomRecord, and Plant
- Task, ShareLink, and AuditLog

The authoritative model requires a dedicated design, Lucid ERD with an accessible
public export, and ADRs for the database and migration strategy before implementation.

### Media Storage

Local filesystem storage is the initial direction. An S3-compatible adapter may be
added later. Media design must cover metadata, integrity, authorization, offline
capture, resumable upload, processing state, thumbnails, retention, export, backup,
and migration between storage backends.

Media is core product data, not an optional attachment subsystem.

## Offline and Synchronization Architecture

Offline behavior is a first-order architecture concern and requires a research
spike before the data layer is chosen. The final design must define:

- Which records and media are available locally
- Local identifiers and server identifiers
- Mutation ordering, idempotency, retries, and deduplication
- Conflict detection, automatic merge rules, and human resolution
- Deletes, tombstones, retention, and multi-device behavior
- Schema and application upgrades with pending local work
- Authentication expiry while offline
- Storage limits and partial synchronization for large commercial datasets
- Observability and user-visible synchronization status without telemetry egress

The product must not claim offline-first based only on caching static assets.

## Identity, Authorization, and Sharing

Current direction:

- Password-optional operation only for a genuinely device-only profile that is not
  reachable over a LAN, VPN, tunnel, or public interface
- Lightweight built-in ApiaryLens accounts and sessions as the default for family
  and small server deployments
- Organization and membership model from the beginning
- Optional standards-based OIDC federation for organization deployments; a
  separate identity provider is not required for family use
- Roles such as Owner, Admin, Apiary Manager, Inspector, Mentor, Viewer, and Club Member
- Explicit permissions for viewing, editing, inspecting, uploading media, approving AI notes, managing members, sharing, and exporting

Scout Bee and server validation must prevent no-auth operation on a non-loopback
interface. Networked credentials and sessions require encrypted transport.
Internet-facing profiles require publicly trusted HTTPS, secure first-owner
bootstrap, generated secrets, throttling, session protection, and safe recovery.
The PWA should use secure same-origin cookie sessions; future native clients require
an OAuth Authorization Code with PKCE design using an external user-agent.

The final design requires [Task 007](../../tasks/007-research-authentication-and-identity.md)
and ADRs covering password storage, sessions, account recovery, bootstrap
administration, tenant isolation, audit behavior, offline authentication,
invitations, public links, optional federation, and native-client authorization.

See [Authentication, Authorization, and Sharing](../security/authentication-and-sharing.md).

## Privacy and Security Architecture

Apiary locations, hive health, media, production, and user identity can be sensitive.
The architecture must provide:

- No analytics, telemetry, or data egress by default
- Explicit consent for external providers and public sharing
- Least-privilege access and organization isolation
- Secure secret handling and documented configuration
- Encryption in transit and appropriate protection at rest
- Auditability for sensitive administrative and sharing operations
- Backup, restore, export, deletion, and retention behavior
- A threat model before public sharing, plugins, or SaaS operation
- Private vulnerability reporting rather than public disclosure
- Secure engineering and release controls including secret, dependency, static, and
  container scanning; SBOMs; signed artifacts and images; checksums; and provenance

The canonical control areas, required artifacts, and initial risk register are in
[Security Architecture](../security/security-architecture.md). Applicable
requirements from OWASP ASVS 5.0 form the initial web-application verification
baseline; the detailed mapping is produced after the stack and trust boundaries are
selected.

Security-sensitive operational details and undisclosed vulnerabilities do not belong
in public documentation, but public product trust boundaries and security decisions do.

### Public and Private Operational Boundary

The open-source product architecture is completely separate from the maintainer's
private governance, identity, vault, project-management, and hosted-infrastructure
systems. A user can install, authenticate to, operate, back up, and upgrade
ApiaryLens without access to any private maintainer service or account.

The public architecture defines portable secret inputs and safe operator options,
such as environment variables, Docker secrets, mounted secret files, and optional
external secret-manager adapters. It never exposes or depends on private vault
names, tenant details, internal authentication brokers, or private automation.

Maintainer-specific hosted-service infrastructure, credentials, vault placement,
naming rules, and governance belong in the private `apiarylens-ops` repository or a
future private infrastructure repository. Only portable interfaces and behavior
that affect users belong in this master plan.

## Weather, Bloom, Sensors, and External Providers

Weather and bloom data should be stored historically and related to hive events,
not merely displayed from a live provider. External integrations must use provider
interfaces, allow disabled/manual operation, document licensing and attribution,
and avoid making an external account mandatory.

Future integrations may include weather stations, hive scales, temperature and
humidity sensors, MQTT, LoRaWAN, Home Assistant, and other adapters. Each requires
its own trust, offline, retention, and compatibility analysis.

See [Weather and Bloom](weather-and-bloom.md).

## Media and Optional AI

Photos and videos belong to the user and must remain usable without AI. AI features:

- Are disabled by default
- Use provider abstractions, including a disabled mode and possible local models
- Require explicit opt-in before data leaves the installation
- Present possible observations, not definitive diagnoses
- Preserve human review and confirmation
- Record provider, model, input provenance, output, review state, and relevant version information
- Degrade cleanly when unavailable

See [Media and AI](media-and-ai.md).

## Brand, Graphics, and Media Asset Production

Approved logos, icons, illustrations, marketing graphics, screenshots, and other
official media are versioned product assets. Their public source of truth is the
ApiaryLens repository that owns and publishes them, initially [`assets/`](../../assets/)
plus the public guidance under [`docs/brand/`](../brand/).

The maintainer may use
[`Hybrid-Solutions-Cloud/studio-foundry`](https://github.com/Hybrid-Solutions-Cloud/studio-foundry)
as an optional private production environment for official pre-rendered graphics and
media. Studio Foundry's research-first workflow, human candidate review, safety
checks, budget gates, provenance, and gated publishing are reusable patterns.

Studio Foundry is not an ApiaryLens runtime service, build dependency, contributor
requirement, or public source of truth. Private prompts, credentials, endpoints,
tenant information, and infrastructure remain private. Approved outputs are human
reviewed, safely attributed, committed to ApiaryLens, and remain usable if the
studio is unavailable.

Real user hive photos, locations, health data, records, or media must never be sent
to a maintainer studio or external generation provider as part of branding. Any
future user-facing generative-media feature requires explicit opt-in, privacy and
retention analysis, and its own ADR.

See [ApiaryLens Brand and Asset System](../brand/README.md).

## Community Galleries and Registries

ApiaryLens may eventually support reusable community assets such as inspection and
workflow templates, report templates, regional bloom datasets, equipment profiles,
provider or sensor adapters, integrations, and plugins.

This is an architectural consideration, not a commitment to a particular feature,
repository, centralized service, or marketplace. The core product must work without
any central registry. Relevant research spikes, designs, and ADRs must explicitly
record their gallery or registry impact.

The canonical requirements, trust considerations, and repository extraction
criteria are in
[Community Galleries and Registries](community-galleries-and-registries.md).

## Deployment Architecture

Deployment priority is defined separately for personally controlled hardware and
cloud environments.

For a complete server on a laptop, desktop, mini-PC, home server, supported NAS, or
local VM, Docker Compose is the first supported target with the intended operator
experience:

```text
docker compose up -d
```

That command is a goal, not a complete deployment design. Before release, the
self-hosted path must cover:

- Versioned container images and pinned dependencies
- Configuration and secrets
- Database migrations and rollback expectations
- Persistent database and media volumes
- Health checks and startup ordering
- TLS and reverse-proxy guidance
- Backup, restore, export, and disaster recovery
- Upgrades and compatibility policy
- Resource requirements and supported platforms
- Logs and local operational diagnostics without default telemetry
- Air-gapped or restricted-network considerations where practical

Docker Compose is the portable server foundation, not the complete experience for a
non-technical family. The project will research a device-local personal mode and a
guided `Scout Bee` bootstrapper that can install or update a profile or emit a
secret-free, versioned deployment-plan JSON document.

For cloud deployment, the ranked targets are:

1. A Cloudflare-native family profile, expected to evaluate Workers Static Assets,
   Workers, D1, R2, and related services
2. Docker Compose on an ordinary provider-neutral Linux VM
3. Later provider-specific managed-container or infrastructure templates
4. A future optional managed ApiaryLens service

The Cloudflare ranking is accepted, but its exact runtime, data, media,
authentication, backup, quota, and migration designs remain gated by Task 006 and
follow-up ADRs.

Do not make a provider's free tier a core backend architecture requirement or
promise of permanent free hosting. Publish provider-neutral server artifacts and
maintain the Compose path while implementing and validating the ranked Cloudflare
family profile. Azure, AWS, GCP, and other VM targets may run the same Compose
artifacts; additional convenience templates follow only when justified. This does
not change the accepted Cloudflare hosting decision for official public frontends. See
[Installation and Deployment Experience](installation-and-deployment-experience.md)
and [Cloud Free-Tier Deployment Spike](../research/cloud-free-tier-deployment-spike.md).

The project will research and publish a reference family cloud profile optimized for
two to five people, synchronized PWA use, simple recovery, and zero or predictably
near-zero recurring cost. The selected profile must publish dated cost assumptions,
quota behavior, data portability, and a migration path. See
[`tasks/006-research-family-cloud-profile.md`](../../tasks/006-research-family-cloud-profile.md).

Kubernetes, Helm, provider-specific managed-container templates, and SaaS
infrastructure are later deployment tracks and do not replace Compose. See
[Deployment Strategy](../deployment/deployment-strategy.md).

## Testing and Validation Strategy

ApiaryLens must be tested across local, virtualized, hosted, and real-device
environments without making a maintainer's private accounts part of the product.
The public test matrix includes Linux and Windows installation, provider-neutral
cloud deployment, required Cloudflare public-frontend deployment, optional
Cloudflare-native and Azure-style backend profiles, current desktop browsers, and
real iPhone and iPad PWA journeys.

Release validation covers offline work, synchronization conflicts, server outages,
media retries, installation, upgrades, rollback, backup and restore, quota
exhaustion, resource use, and dated family-cost measurements. Exact maintainer
accounts, credentials, and private infrastructure remain outside the public repo.

See [Deployment, PWA, and Cost Test Strategy](../testing/deployment-test-strategy.md).

## Research, Design, and ADR Process

Architecture work follows this sequence:

1. Record the question or requirement.
2. Run a research spike when meaningful uncertainty exists.
3. Document design options and a recommendation.
4. Propose an ADR for a durable decision.
5. Obtain human review and acceptance.
6. Update this master plan and focused documentation.
7. Create scoped implementation tasks.
8. Implement and verify.

The authoritative workflow chart will be maintained in Lucid and cataloged in
[`docs/diagrams/README.md`](../diagrams/README.md).

A research spike is required when a decision depends on uncertain framework
behavior, offline feasibility, security properties, data migration, performance,
licensing, interoperability, or operational complexity. A spike is not required
when constraints and consequences are already clear, as with the accepted domain
assignment.

Research belongs under [`docs/research/`](../research/). Durable decisions belong
under [`docs/adr/`](../adr/). Detailed current-state designs belong under
`docs/architecture/`, `docs/security/`, or `docs/deployment/`. Implementation work
belongs under [`tasks/`](../../tasks/).

Every relevant design or ADR must address:

- Effect on self-hosting and required external services
- Offline behavior and synchronization
- Privacy, security, and data portability
- Scale from small to commercial installations
- Optional hosted-service implications without making SaaS required
- Repository and source-of-truth ownership
- Gallery or registry impact when reusable/community assets are involved
- Alternatives, consequences, migration, and rollback where applicable

## Required Decisions Before Application Scaffolding

The following work is required before dependent implementation begins:

1. Preserve accepted ADR 0003, Apache-2.0 licensing, DCO 1.1 sign-off, and
   dependency/asset license provenance.
2. Research MVP PWA local storage, offline durability, backup interaction, and
   synchronization; defer no-server device-only identity and migration to P1.
3. Research and select the frontend stack and offline persistence approach.
4. Research the `Scout Bee` packaging, privileged executor, signing, update, and rollback model.
5. Research local-network HTTPS, PWA installation, and multi-device access.
6. Research and select the backend framework.
7. Define the initial domain model and organization-isolation rules.
8. Select the database, migration, and data-access tooling for each supported footprint.
9. Design the offline synchronization and conflict-resolution protocol.
10. Complete identity and authentication research, then accept ADRs for exposure
    modes, sessions, account recovery, optional OIDC, authorization, organization
    isolation, and sharing.
11. Design media storage, upload, processing, export, and backup.
12. Define background-job requirements and select tooling if a worker is needed for MVP.
13. Define the versioned API and OpenAPI workflow.
14. Define the versioned, secret-free deployment-plan JSON schema.
15. Complete the Compose deployment, upgrade, backup, restore, and diagnostics design.
16. Create the dedicated Lucid folder and migrate the legacy diagrams.
17. Define the public brand brief, visual identity, asset formats, licensing, and provenance manifest.
18. Validate the Cloudflare-first family cloud profile and Compose-on-VM fallback
    using measured cost, capacity, quota, backup, and migration evidence.
19. Define the supported iPhone, iPad, and desktop PWA compatibility matrix.
20. Define the versioned deployment-connection contract used by PWA and future native clients.
21. Define provider-neutral secret inputs and optional secret-manager adapter boundaries.
22. Complete the initial threat model, ASVS verification mapping, software-supply-chain
    controls, and release signing/provenance design.
23. Define and prove the common Cloudflare Workers Static Assets build, preview,
    custom-domain, security-header, production approval, and rollback convention for
    the three public frontends.
24. Define the product-version source of truth, release manifest, release channels,
    independently versioned API/synchronization/migration/deployment/export
    contracts, PWA update behavior, support window, and cross-profile recovery
    policy described by
    [Versioning, Release, and Update Lifecycle](versioning-release-and-update-lifecycle.md).
25. Produce the ordered implementation plan from the approved
    [MVP Definition and UAT Contract](../product/mvp-definition.md) and accepted
    implementation decisions.

Some decisions can proceed in parallel, but no framework or infrastructure should
be installed merely because it appears as the current direction in this document.

## Documentation and Source-of-Truth Map

| Information | Authoritative location |
|---|---|
| Non-negotiable contributor and agent constraints | [`AGENTS.md`](../../AGENTS.md) |
| Master assembled architecture | This document |
| Durable decisions and rationale | [`docs/adr/`](../adr/) |
| Research evidence and spikes | [`docs/research/`](../research/) |
| Focused technical design | [`docs/architecture/`](./) |
| Editable diagrams and public exports | Lucid `ApiaryLens` folder and [`docs/diagrams/`](../diagrams/) catalog |
| Approved brand and media assets | [`assets/`](../../assets/) and [`docs/brand/`](../brand/) |
| Security architecture and risk register | [Security Architecture](../security/security-architecture.md) |
| Authentication, authorization, and sharing design | [Authentication, Authorization, and Sharing](../security/authentication-and-sharing.md) |
| Deployment design and runbooks | [`docs/deployment/`](../deployment/) |
| Version, release, update, migration, and recovery contract | [Versioning, Release, and Update Lifecycle](versioning-release-and-update-lifecycle.md) |
| Deployment, PWA, recovery, and cost testing | [`docs/testing/`](../testing/) |
| Authoritative MVP scope and UAT contract | [MVP Definition and UAT Contract](../product/mvp-definition.md) |
| Product direction and public narrative | [`docs/product/`](../product/) |
| Delivery sequencing | [Roadmap](../roadmap/roadmap.md) |
| Portfolio execution gates | [Execution Plan](../roadmap/execution-plan.md) |
| Scoped implementation work | [`tasks/`](../../tasks/) |
| Historical imported material | [`docs/source-documents/`](../source-documents/) |

Future `apiarylens.org` and `apiarylens.dev` sites may render or publish material
from these sources. They must not create divergent copies of core technical
contracts or architecture decisions.

## Roadmap Relationship

The architecture supports phased delivery without treating later features as MVP
requirements. The current phases cover foundation, core hive records, health and
production, weather and bloom intelligence, sharing, optional AI, native wrappers,
sensors and integrations, and commercial/research scale.

The authoritative delivery sequence is the
[ApiaryLens Roadmap](../roadmap/roadmap.md), with delivery gates in the
[Execution Plan](../roadmap/execution-plan.md). Architecture decisions may change
how a phase is implemented, but changes to product sequencing belong in those
roadmap documents.

## Maintenance Rule

Review this master plan whenever:

- An ADR is accepted, superseded, or deprecated
- A repository or public property is activated
- A technology or deployment target is selected
- An installation tier, Scout Bee behavior, or local-storage assumption changes
- A release version, contract compatibility, migration, update, rollback, support,
  or artifact-promotion policy changes
- Family cloud cost targets, device support, or provider reference profiles change
- A source-of-truth boundary changes
- Diagram tooling, Lucid folder structure, or export rules change
- Public/private operational boundaries or portable secret inputs change
- A new external provider, plugin mechanism, gallery, or registry is designed
- The brand-production workflow, asset source of truth, licensing, or provenance changes
- The roadmap introduces a new architectural capability
- Implementation reveals that an assumption in this plan is false

The plan should describe the system that is currently intended, clearly labeling
accepted decisions, active direction, and unresolved questions.
