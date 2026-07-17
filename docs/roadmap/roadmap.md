# ApiaryLens Roadmap

## Current release: Public Preview 1

ApiaryLens is in Public Preview 1, not GA. The core MVP implementation is available
for real-world evaluation, while owner/device acceptance continues. Preview features
and workflows may change, with updates sometimes arriving multiple times per day.
Keep backups and exports current; Preview 1 must not be the sole copy of irreplaceable
hive records or media. See the [Preview 1 release notes](../releases/0.1.0-preview.1.md)
and [MVP UAT record](../testing/mvp-uat.md).

## MVP Target

The initial go-to-market user is a family or hobbyist beekeeper. The default journey
must be easy to start, update, back up, restore, and understand without requiring
container, database, DNS, TLS, identity-provider, or cloud-billing expertise.

The accepted authoritative scope and release gates are in the
[MVP Definition and UAT Contract](../product/mvp-definition.md). Roadmap items outside
that document's P0 section do not block the MVP.

ApiaryLens is designed in capability tiers: personal, family, and organization.
Commercial and research scale remains on the roadmap, but it must not make the MVP
experience heavier.

## Phase 0: Project Foundation — Complete

- GitHub org setup
- Activate and clone the six-repository portfolio
- Responsibility-specific repository scaffolds and cross-repository governance
- Domain strategy
- Monorepo setup
- README
- AGENTS.md
- License decision
- Contribution docs
- Security docs
- Initial security architecture, risk register, and exposure-mode rules
- Product brief
- Architecture plan
- Roadmap
- ADR process
- Task backlog
- Dedicated Lucid `ApiaryLens` folder and diagram catalog
- Public/private architecture boundary
- Public brand brief, visual identity, asset license, and provenance workflow
- Optional Studio Foundry production workflow for approved pre-rendered assets
- Cloudflare Workers Static Assets convention for `.org`, `.app`, and `.dev`
- Cloudflare custom-domain, TLS, preview, production, and rollback foundation

## Phase 1: MVP Product and Public Preview — Implemented; final UAT open

- Networked and internet-facing security profiles with secure defaults
- Built-in family authentication, secure sessions, bootstrap, and recovery
- Authorization and organization-isolation test foundation
- Threat model and applicable OWASP ASVS verification matrix
- Secret, dependency, static-analysis, and container scanning
- Release SBOM, checksums, signing, and provenance
- One semantic product release version, exact build identity, and machine-readable
  release manifest across product clients, API, backend profiles, and documentation;
  Scout Bee moves to its own compatible release lifecycle under ADR 0014
- Independently versioned API, synchronization, migration, deployment-plan, and
  portable-export contracts with a published compatibility policy
- Organizations
- Users
- Roles
- Apiaries
- Hives
- Basic PWA shell
- Approved PWA icons, application marks, and accessible brand assets
- Durable PWA local working set and offline behavior
- Guided family onboarding
- Backup, restore, and export foundation
- Backend API
- Shared SQLite schema: D1 on Cloudflare and `node:sqlite` in Compose
- Offline synchronization foundation
- Basic family membership and multi-device access
- Docker Compose as the first complete server target on personally controlled hardware
- Cloudflare-native family cloud as the first cloud target
- Docker Compose on an ordinary Linux VM as the second cloud target
- Versioned deployment-plan schema
- Completed Scout Bee MVP for the Hyper-V Compose UAT VM and Cloudflare, with Azure
  Compose automation conditional for the first UAT checkpoint
- Safe public demo
- Near-free, always-available family cloud reference research
- iPhone, iPad, and desktop PWA compatibility testing
- Deployment, upgrade, backup, restore, and cost acceptance suite
- Guided and direct Cloudflare/Compose update paths with backup-before-update,
  migrations, health verification, resume, compatible rollback, and full restore
- PWA update activation that preserves active and pending offline work
- Release index, curated release pages, changelog, roadmap, support window,
  compatibility matrix, upgrade guide, recovery guide, and in-app Version and Build
- Final logo family, PWA icons, UX designs, Lucidchart sources, accessible diagram
  exports, screenshots, and complete user/operator/developer documentation

### Corrective MVP UAT Backlog

- Re-test installed PWA launch on a real iPhone with cellular/Wi-Fi disabled after
  the service-worker precache fix; confirm the dashboard, local inspection, and
  staged media remain available before closing the MVP release gate.

## Version 1.1 Backlog: Provider Expansion and Extended Acceptance

These items are deliberately post-MVP backlog work. They do not change the required
Cloudflare family profile, approved Hyper-V Compose profile, or the installable PWA
core accepted for the MVP release.

- AWS EC2 Compose compatibility evidence and provider-specific operating guidance
- Optional AWS/GCP Scout Bee adapters and disposable-provider lifecycle automation
- Windows-to-Linux Scout deployment remains provider-neutral and requires no typed
  Linux commands; it is now part of the larger Windows-first platform program below
- Extended field-device acceptance on physical iPhone and iPad hardware, including
  invitation, offline media, interrupted-update, and multi-device synchronization
  sessions beyond the required MVP profile evidence
- Manual NVDA, VoiceOver, true 200% zoom, forced-colors, and destructive-flow
  accessibility review with a maintained assistive-technology support matrix
- A formal community support program, support-response targets, and expanded support
  channels beyond the current public documentation and issue/discussion workflow

## Version 1.1 Backlog: Preview Usability and Guided Beekeeping

Hands-on Preview 1 feedback adds the following prioritized outcomes. These refine
existing capabilities as well as add new product experience; they do not redefine
the completed Preview 1 artifact.

### Now

- Automatic synchronization during normal online use, on application resume, and
  after reconnect; manual Sync becomes a recovery and status control
- Permanent installed-PWA offline-launch regression coverage across iPhone, iPad,
  and desktop
- Safe in-app PWA update notification with pending-work protection
- A clear owner-facing Members area for invitations, roles, revocation, and removal
- Discoverable, profile-aware backup status, backup creation, restore, and recovery
  guidance
- Pointer- and keyboard-activatable Overview cards that route to their represented
  product areas

### Next

- A beekeeper-reviewed intelligent-field audit with controlled vocabularies,
  conditional Other values, units, validation, and accessible controls
- Queen identifier types plus marking-color/year entry and complete queen history
- An accessible visual and textual hive equipment-stack builder for brood boxes,
  queen excluders, honey supers, covers, and other configurations
- A searchable beekeeping glossary linked from product terminology and help
- Clear manual inspection weather entry followed by optional, privacy-preserving
  provider-assisted weather context in Phase 4
- Cross-device authentication/session explanations and session-management UX without
  weakening secure-cookie or server-side authorization boundaries

## Active Preview 2 Direction: Windows-First Client and Scout Bee

This strategic program takes precedence over Phase 2 and later feature expansion.
It makes a packaged Windows client the default family starting point while keeping
the backend and optional web frontend as the portable connected core.

### Now — authorized implementation and release-gate evidence

- The owner approved the detailed project plan and live tracker; production
  implementation is active while exact package, security, accessibility, and UAT
  gates remain open
- Scout Bee now has a separate public repository, independent version, UI, Go
  executor, Windows/Linux verification, and release workflow; production signing
  and released-artifact lifecycle evidence remain open
- ADR 0015 keeps the initial Windows client in the product monorepo. The Electron
  host now runs the real React/API/SQLite/media composition, supports standalone and
  connected profiles, verified backup/restore, and produces Squirrel Setup/update
  artifacts. Exact Windows run `29601638394` passed package, installed-host, and
  keep-data-uninstall verification; production signing and physical UAT remain
- Keep follow-on ADRs and the detailed security, UX, lifecycle, and data designs
  synchronized as implementation evidence closes or changes a decision
- Maintain the authoritative Lucidchart diagrams and accessible exports for
  standalone, connected, migration, update, backup, and repository/artifact flows
- Continue framework-neutral standalone/connected connection contracts and tests
- Complete Scout's signed portable Windows executable (no Go, Node, WSL, or Linux
  shell required), Linux single-executable archive, Stable-default channels,
  verified artifact cache, Windows-client lifecycle adapter, secret-free plan
  export, and `my-apiarylens` CI handoff

### Next release outcome — Windows standalone and connected family

- Ship a signed Windows application that runs completely standalone with embedded
  loopback service, SQLite, local media, offline use, updates, and backup/restore
- Let the current Windows installation add family access through Scout Bee without
  starting over or losing local records/media
- Let Scout install/update Windows, deploy backend only or backend plus web to
  Cloudflare or Linux over SSH, and configure a secret-free connection profile
- Let Scout verify immutable release manifests, checksums, attestations, sizes, and
  compatibility before install, while retaining verified versions for resume and
  rollback and updating Scout through its independent channel
- Implement automatic connected synchronization, native-client authentication,
  migration/conflict/resume/rollback, diagnostics, repair, and safe uninstall
- Incorporate all Preview owner-feedback fixes into shared client behavior
- Publish complete user, Scout, operator, developer, troubleshooting, and recovery
  how-to guides through `.org` and `.dev`

### Later — additional clients and orchestration

- iPhone/iPad and Android product clients using the same public connection and sync
  contracts
- Research a mobile Scout companion for safe provider orchestration and connection
  handoff; do not bypass App Store/Play distribution or phone security constraints
- Extract an individual product client to a separate repository only if a later ADR
  demonstrates that independent ownership/release/toolchain needs outweigh drift

## Phase 2: Hive Record Expansion — Post-MVP

Inspections, queens, boxes/equipment, photos, notes, and hive history are already in
the MVP. The post-MVP expansion includes:

- Frame tracking
- Videos
- Tags
- QR codes

## Phase 3: Health and Production Expansion — Post-MVP

Mite counts, treatments, feeding, health observations, and honey harvest records are
already in the MVP. The post-MVP expansion includes:

- Structured disease and pest catalogs
- Wax harvest
- Reports

## Phase 4: Weather and Bloom Intelligence

- Forecast weather
- Historical weather
- Weather pattern tracking
- Frost dates
- Rainfall
- Growing degree days
- Bloom calendar
- Forage plant database

## Phase 5: Advanced Sharing and Club Mode

- Mentor sharing
- Family sharing
- Bee club organizations
- Read-only links
- Shared inspections
- Exportable reports
- Organization OIDC administration and advanced identity federation

## Phase 6: AI Assistance

- AI photo observations
- AI inspection summaries
- AI seasonal recommendations
- AI risk flags
- AI provider abstraction
- Local model option

## Phase 7: Native Mobile

- Downloadable iPhone application distributed through the Apple App Store
- Connection to self-hosted, family-cloud, and future managed ApiaryLens deployments
- Shared public authentication, API, synchronization, media, and portability contracts
- Guided server URL, QR code, or connection-file onboarding
- Capacitor, alternate wrapper, or native implementation research and ADR
- iPad experience based on the shared Apple client where practical
- Android app
- Native signing, packaging, privacy, and release pipeline
- Push notifications
- Camera integration
- Offline sync improvements

Dependencies:

- Mature PWA mobile workflows
- Stable versioned API and synchronization protocol
- Authentication and deployment-connection contracts
- Supported HTTPS and trust guidance for self-hosted deployments
- Apple developer account, private signing assets, and App Store release operations

## Phase 8: Sensors and Integrations

- Hive scales
- Temperature sensors
- Humidity sensors
- MQTT
- LoRaWAN
- Home Assistant integration
- Weather stations

## Phase 9: Commercial / Research Scale

- Route planning
- Large apiary support
- Employee roles
- Pollination contracts
- Research mode
- Advanced exports
- SaaS option

Commercial scale extends the same organization, membership, API, data, and
deployment contracts. It must not require a separate product edition or migration
away from portable ApiaryLens data.

## Cross-Cutting: Community Galleries and Registries

Future phases may introduce reusable community assets such as templates, regional
datasets, equipment profiles, adapters, integrations, or plugins. Each relevant
feature must evaluate gallery and registry implications using
[`../architecture/community-galleries-and-registries.md`](../architecture/community-galleries-and-registries.md).
This consideration does not commit the project to a centralized registry,
marketplace, separate repository, or delivery phase.
