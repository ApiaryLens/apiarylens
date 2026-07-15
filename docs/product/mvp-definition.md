# ApiaryLens MVP Definition and UAT Contract

## Document Status

**Status:** Accepted

**Date:** 2026-07-15

**Decider:** Kristopher Turner, project owner

**Accepted:** 2026-07-15

This document is the authoritative ApiaryLens MVP scope. The
[Feature Inventory](../architecture/feature-inventory.md) remains the broader
roadmap inventory and must not be interpreted as MVP scope.

## MVP in One Sentence

ApiaryLens MVP enables a family or hobbyist beekeeper to securely maintain a shared
history of apiaries and hives, record inspections and photos offline from an
installable PWA, synchronize them across authorized devices, track essential hive
health and management actions, and retain portable ownership of all records through
a near-free Cloudflare family deployment or a self-hosted Docker Compose server.

MVP means a complete, installable, documented, and usable product rather than a
prototype or architecture demonstration. Every P0 capability in this document must
be available through every supported server deployment profile unless this document
explicitly identifies a profile-specific operational difference.

## Primary User

The primary user is a family or hobbyist beekeeper managing approximately one to
twenty hives. The reference scenario is a parent and child who use iPhones, iPads,
laptops, and desktop computers, sometimes in a bee yard with weak or unavailable
connectivity.

The MVP must not require them to understand containers, databases, DNS, TLS,
identity providers, object storage, or cloud billing to complete the recommended
family-cloud journey.

## Core User Promise

A new family can:

1. Open ApiaryLens and create the first owner safely.
2. Create a family, apiary, and hive.
3. Install the PWA on supported phones, tablets, and computers.
4. Record an inspection and attach photos without connectivity.
5. Reconnect and synchronize without losing or duplicating work.
6. See the same authorized hive history from another family device.
7. Record essential health, feeding, treatment, and harvest information.
8. Back up, restore, and export their records and media.
9. Understand where their data is stored and how to move it.
10. Use the same MVP product capabilities whether the backend is the Cloudflare
    family profile, Docker Compose on personally controlled hardware, or Docker
    Compose on a supported Azure, AWS, or GCP Linux VM.

If this journey is incomplete, the product is not MVP-ready.

## Goals

- A first-time beekeeper completes onboarding and records a first inspection within
  ten minutes without administrator documentation.
- The same family record is available to at least two authorized users across an
  iPhone or iPad and a desktop-class browser.
- Inspection creation, editing, and photo attachment work offline after the PWA has
  been installed and initialized.
- Tested reconnect and retry scenarios produce no lost or duplicate accepted
  records.
- A complete backup can be restored into a fresh compatible deployment and a
  portable export includes relational data and media.
- A supported family deployment has measured, published resource and cost limits
  with no required paid product, AI, analytics, email, SMS, or identity service.

## P0: Required Product Capabilities

Everything in this section is required for the MVP release candidate.

### 1. Installable Offline-First PWA

- Responsive PWA for supported iPhone, iPad, laptop, and desktop browsers
- Install guidance and successful offline relaunch after initial setup
- Accessible, outdoor-usable navigation, forms, contrast, and touch targets
- Local durable record store for the authorized working set
- Visible local, pending, synchronized, conflicted, and failed states
- Queued mutations, retry, idempotency, and deterministic MVP conflict handling
- Safe application and schema updates while local work is pending
- No native-only API requirement for an MVP workflow

### 2. Built-In Accounts and Family Access

- Secure first-owner bootstrap with no default credentials
- Built-in username or email-style identifier and password authentication without a
  required email-delivery service
- Secure browser sessions, logout, expiration, rotation, throttling, and recovery
- One family organization with multiple memberships
- MVP roles: Owner, Beekeeper, and Viewer
- Owner-managed invitation or one-time enrollment flow
- Server-enforced organization isolation and authorization
- Authentication and encrypted transport for every network-reachable deployment
- Password-optional behavior only for a future proven device-only profile, not the
  networked MVP

OIDC federation, passkeys, social login, and native-client OAuth are not MVP
requirements.

### 3. Apiaries, Hives, Queens, and Essential Equipment

- Create, view, edit, archive, and restore apiaries and hives
- Apiary fields: name, optional location, access notes, and general notes
- Hive fields: stable ID, name or number, apiary, status, install date, origin, and
  notes
- Current queen and queen-history basics: identifier, marked state, mark color or
  year, source, introduction date, status, and notes
- Box-level equipment stack sufficient to describe the active hive configuration
- History preserves meaningful changes rather than silently replacing prior facts

Frame-by-frame inventory, lineage analysis, QR codes, and advanced equipment
inventory are later capabilities.

### 4. Inspection Capture and History

- Start, save, edit, complete, and review an inspection
- Record date and time, inspector, hive, notes, temperament, population strength,
  queen seen, eggs or larvae present, brood condition, stores, and follow-up notes
- Optional manual weather snapshot fields without requiring a weather provider
- Attach, caption, view, retry, and remove inspection photos
- Hive timeline showing inspections and essential management events in chronological
  order
- Simple dashboard showing hives, most recent inspection, pending synchronization,
  and recorded follow-up items

### 5. Essential Health and Management Records

- Varroa mite count with method, sample size where applicable, result, date, and notes
- Disease or pest observation recorded as an observation, never an automated final
  diagnosis
- Feeding event with type, amount, date, reason, and notes
- Treatment event with product or method, application and removal dates, dosage or
  amount, restrictions, and notes
- Honey harvest with date, weight or quantity, source hive, and notes
- Follow-up item with description, due date, completion state, and related hive
- Basic chronological and mite-count trend views

### 6. Photo Media

- Capture or select supported image formats through browser capabilities
- Offline staging and resumable or safely retryable upload
- Authorized thumbnails and original-image access
- Metadata, integrity, ownership, processing state, backup, export, and deletion
- Reasonable client-side size handling with clear quota and failure messages

Video upload, transcoding, streaming, and AI image review are not MVP requirements.

### 7. Synchronization and Multi-Device Behavior

- Versioned synchronization contract shared by every supported backend profile
- Client-generated identifiers or another design that permits offline creation
- Idempotent create and update operations
- Retry and deduplication after interruption or application restart
- Explicit MVP rules for concurrent edits and deletes
- User-visible conflict or failure recovery when an automatic merge is unsafe
- Media lifecycle coordinated with its parent record
- Equivalent conformance tests against Cloudflare-native and Compose backends

Static-asset caching alone does not satisfy this requirement.

### 8. Data Ownership, Backup, Restore, and Export

- Deployment backup covering database, media, configuration references, and version
  metadata without exposing secrets
- Verified restore into a fresh compatible deployment
- Portable full export containing documented structured data and original media
- Human-usable CSV export for primary hive and inspection records where practical
- Export and migration documentation for Cloudflare and Compose profiles
- Clear destructive-action confirmation and retention behavior
- No product telemetry or external data transfer by default

### 9. Supported Deployment Profiles

The deployment order follows
[ADR 0007](../adr/0007-deployment-profile-priority.md).

#### Family Cloud - Cloudflare

- First recommended cloud profile for synchronized family use
- PWA, API, relational data, and media components selected through the required
  research and technical ADRs
- Published quotas, current cost assumptions, backup behavior, and migration path
- Hard cost controls or graceful quota behavior that avoids surprise billing
- No claim that a provider's current free allowance is permanent

#### My Own Hardware - Docker Compose

- First complete server target on personally controlled hardware
- Versioned images, persistent volumes, health checks, secure configuration,
  migration, backup, restore, update, rollback, and diagnostics
- Supported Linux host or VM instructions
- No Cloudflare or other third-party account required

#### Cloud Virtual Machine - Docker Compose

- Second cloud target and portable fallback
- Same released Compose artifacts on an ordinary supported Linux VM
- Provider-neutral instructions plus verified Azure, AWS, and GCP Linux VM
  compatibility; provider-specific provisioning may differ, but product behavior
  must not
- Published resource envelope and expected cost components

#### Cross-Profile Feature Parity

- The Cloudflare and Compose profiles expose the same versioned release-scope API,
  synchronization, authorization, data, media, backup, export, and migration
  behavior.
- No MVP hive-management capability is available only in an official hosted or
  provider-specific profile.
- The same automated domain, authorization, synchronization, export, and end-to-end
  suites run against Cloudflare, local Compose, and Compose-on-VM environments.
- Profile differences are limited to documented operational concerns such as
  provisioning, storage implementation, quotas, cost, scaling, backup mechanics,
  and infrastructure diagnostics.

### 10. Scout Bee MVP

Scout Bee is a completed MVP product component, not only a research spike or
proof-of-concept script. Its MVP scope is deliberately limited to the deployment
targets needed to prove the product.

Required automated targets:

1. **Hyper-V test VM - Docker Compose:** provision or connect to the approved Linux
   test VM on the maintainer's local Hyper-V host, install the released Compose
   profile, initialize it safely, and verify the deployment.
2. **Family Cloud - Cloudflare:** deploy the accepted Cloudflare-native family
   profile into a user-owned Cloudflare account and verify the PWA, API, data,
   media, identity, backup, quota, and export paths.

Conditional MVP target:

3. **Azure Linux VM - Docker Compose:** provision or connect to a suitable Azure VM,
   deploy the same released Compose profile, and verify it. This Scout adapter is a
   desired MVP capability but does not block the first UAT checkpoint if the two
   required targets are complete. Manual documented Azure Compose deployment
   remains part of supported cloud-VM compatibility.

AWS and GCP-specific Scout automation are not MVP requirements. The generic
Compose release and prerequisites must remain compatible with suitable Linux VMs on
those providers.

Scout Bee MVP must include:

- A completed, branded, accessible guided interface and finalized product name
- Plain-language target selection and explanation of ownership, exposure, cost, and
  availability
- Preflight validation and refusal of unsafe exposure, unsupported prerequisites,
  default credentials, public HTTP, or missing production secrets
- Secret-free, versioned `apiarylens-deployment.json` generation
- Secure runtime secret acquisition without writing secrets to the plan, source,
  logs, diagnostics, or URLs
- Idempotent apply, dry run, resume, cancellation, and safe re-entry
- Deployment progress, health verification, and actionable sanitized failure output
- Backup-before-update, version compatibility checks, update, rollback, restore,
  export, uninstall, and keep-data behavior for supported targets
- A redacted diagnostics bundle and clear recovery guidance
- Automated unit, integration, failure, and end-to-end tests for each supported
  target adapter
- Public user and operator documentation that does not depend on maintainer-private
  infrastructure

Maintainer-specific Hyper-V, Cloudflare, or Azure values and credentials remain in
private configuration or secret stores. Scout's public target contracts and
implementations must use portable inputs and must not embed those values.

### 11. Public Properties and Documentation

- `apiarylens.org`: accurate project overview, MVP capabilities, getting started,
  self-hosting, security, privacy, downloads or release links, roadmap, and changelog
- `apiarylens.app`: installable PWA entry and safe resettable public demo using only
  synthetic data
- `apiarylens.dev`: versioned API/OpenAPI material, architecture overview,
  contributor setup, and integration boundaries available for the MVP
- `apiarylens.com`: redirect to `.org`
- Cloudflare preview and production deployment with TLS, security headers, rollback,
  and least-privilege credentials
- Operator, user, deployment, backup, restore, migration, UAT, and troubleshooting
  documentation

### 12. Complete Design, Brand, Diagram, and Documentation Package

The MVP is not complete while required design or communication artifacts remain
draft placeholders.

- Approved ApiaryLens logo family, wordmark, icon, favicon, PWA icons, maskable
  icons, social-sharing images, color system, typography, and usage guidance
- Licensed and provenance-recorded photography, illustrations, marketing graphics,
  screenshots, diagrams, and release assets
- Responsive UX designs and documented flows for onboarding, authentication,
  dashboard, apiary and hive management, inspections, offline state,
  synchronization, conflicts, media, family membership, backup, restore, export,
  deployment, recovery, and destructive actions
- Component and interaction guidance sufficient to implement and verify consistent,
  accessible interfaces
- Lucidchart sources in the dedicated `ApiaryLens` folder for system context,
  components, deployment profiles, network and trust boundaries, authentication,
  authorization, data model, offline synchronization, media lifecycle, backup and
  restore, Scout Bee, CI/CD, release promotion, platform update, rollback and
  recovery, and the primary user journeys
- Accessible SVG or PNG exports of every required Lucidchart diagram committed and
  cataloged in the public repository with explanatory Markdown
- Current product, architecture, ADR, security, privacy, API, deployment, user,
  operator, contributor, troubleshooting, release, changelog, roadmap, and UAT
  documentation
- No contradiction among the application behavior, public websites, diagrams,
  release notes, and authoritative design documents

### 13. Versioning, Releases, and Safe Updates

Updating the platform is an MVP capability, not a post-release operations task. The
required lifecycle is defined in
[Versioning, Release, and Update Lifecycle](../architecture/versioning-release-and-update-lifecycle.md).

- One user-facing semantic product version ties together the PWA, API, supported
  backend profiles, Compose bundle, Cloudflare profile, Scout Bee compatibility,
  and release documentation
- Every build exposes its version, source commit, build time, release channel,
  deployment profile, API contract, synchronization protocol, database migration
  head, deployment-plan schema, export format, and immutable artifact identity
- A machine-readable release manifest binds released artifacts, digests, contracts,
  migrations, SBOMs, signatures, provenance, release notes, and known limitations
- `apiarylens.org` publishes a release index, curated release pages, downloads,
  changelog, roadmap, support window, upgrade instructions, and recovery guidance
- `apiarylens.dev` publishes the versioned OpenAPI contract, schemas, developer
  changelog, compatibility policy, and integration migration guidance
- The PWA provides a Version and Build view linked to the matching release notes
- Scout Bee provides version discovery, compatibility and prerequisite checks,
  verified backup-before-update, migration progress, health checks, resume,
  application rollback, full-restore guidance, and sanitized diagnostics for its
  supported targets
- Direct Cloudflare and Compose update procedures remain documented so Scout Bee is
  helpful but not a lock-in requirement
- PWA service-worker and local-store updates preserve an active inspection, pending
  mutations, staged media, and offline access; a routine update never forces a
  data-losing reload
- Released database migrations are immutable and tested from every directly
  supported prior version or seeded predecessor
- Cloudflare and Compose deployments use explicit release artifacts or provider
  revisions and never depend on an untraceable mutable `latest` identity
- A failed or interrupted update has a tested resume, compatible application
  rollback, or verified full-restore path, with data-loss boundaries explained
  before recovery begins

The first public release still proves the complete update path by upgrading from a
seeded predecessor or earlier release candidate. Having no previous public stable
release does not waive the MVP update requirement.

## P1: Important Fast Followers That Do Not Block MVP

- Proven no-server, device-only personal mode and migration into family sync
- Manual bloom calendar and deeper weather-history foundations
- Mentor-specific sharing and scoped read-only reports
- QR-code hive entry
- More detailed box and frame inventory
- Inspection templates and richer reports
- Video capture and storage
- Passkeys and optional OIDC interoperability
- Additional one-click Azure, AWS, or GCP templates beyond the tested Compose VM
  reference
- Polished packaged Scout Bee desktop applications for additional operating systems

## Explicitly Outside the MVP

- Native iPhone App Store application
- Native Android application
- Capacitor or other native application wrapper
- Push notifications that require native services
- AI photo review, summaries, recommendations, or diagnosis
- Hive sensors, scales, MQTT, LoRaWAN, Bluetooth, and Home Assistant
- Bee-club administration, extension-office, research, and commercial workflows
- Advanced OIDC administration and enterprise identity federation
- Public galleries, registries, plugin marketplace, or community publishing
- Financial accounting, inventory purchasing, route planning, and pollination
  contracts
- Advanced weather forecasting, bloom intelligence, forage databases, and automatic
  environmental correlation
- Frame-level digital-twin tracking and queen-rearing lineage workflows
- Public sharing links and anonymous reports
- SaaS subscriptions, billing, support plans, and commercial account management
- Kubernetes, Helm, high-availability clusters, and commercial-scale operations

These exclusions constrain implementation scope; the architecture must not
unnecessarily prevent their later addition.

## Non-Functional Release Requirements

### Security and Privacy

- No unresolved critical or high-severity vulnerability without written project-owner
  disposition
- Threat model and applicable OWASP ASVS verification mapping for the release scope
- Secret, dependency, static-analysis, and container scanning in CI
- Secure cookies and session controls for the PWA; no long-lived bearer token in
  browser storage
- No secrets in source, URLs, logs, diagnostics, exports, images, or deployment-plan
  JSON
- No telemetry, analytics, AI, or external provider data transfer enabled by default

### Reliability and Data Integrity

- No lost or duplicated accepted records in the required offline and retry suite
- Database migrations, application updates, failed updates, and rollback tested
- Backup and full restore tested from released artifacts
- Cloudflare quota failure, unavailable backend, interrupted media upload, and
  pending local work tested and recoverable

### Accessibility and Usability

- WCAG 2.1 AA target for the PWA and public properties
- Keyboard operation, screen-reader labels, error association, contrast, responsive
  layout, and outdoor-size touch targets tested
- No core journey requires color alone, hover, precision pointing, or uninterrupted
  connectivity

### Supply Chain and Release

- Reproducible documented builds from public product sources
- One traceable product release version plus independently versioned API,
  synchronization, migration, deployment-plan, and export contracts
- Versioned migrations, release manifest, curated release pages, changelog, roadmap,
  compatibility matrix, upgrade guide, and recovery documentation
- SBOMs, checksums, signatures, and provenance for released artifacts and images
- Supported-version, upgrade, rollback, vulnerability-reporting, and data-migration
  policies published

### Design and Documentation Completion

- No release-critical logo, application icon, screenshot, UX flow, Lucidchart
  source, accessible diagram export, user guide, operator guide, or API document is
  left as a placeholder or undocumented private dependency
- Every published graphic and design asset has its source, license, approval status,
  and provenance recorded
- Documentation and diagrams are reviewed against the released behavior during the
  release-candidate gate

## MVP UAT Acceptance Journey

The MVP release candidate passes only when the project owner can complete this
journey using released or release-candidate artifacts:

1. Visit `.org`, understand the product, and reach the demo and installation paths.
2. Use the resettable demo without providing real hive or identity data.
3. Create the first owner and family in a private UAT deployment.
4. Add an apiary, two hives, a queen, and a box-level configuration.
5. Install the PWA on an iPhone or iPad and a desktop-class browser.
6. Take one device offline and record an inspection with at least two photos, a mite
   count, feeding, treatment, harvest, and follow-up item.
7. Relaunch while offline and verify the pending work remains available.
8. Reconnect and verify synchronization completes once without data loss or
   duplication.
9. Sign in as a second family member and verify authorized shared history.
10. Verify a Viewer cannot modify protected records or access another organization.
11. Back up the deployment and restore it into a fresh compatible environment.
12. Export the complete family data and original media and inspect the documented
    contents.
13. Open Version and Build and trace the PWA and backend to the exact release page,
    source commit, artifacts, API contract, migration head, and known limitations.
14. With an inspection and photos pending offline, update the compatible server and
    PWA release; verify the local work survives and synchronizes exactly once.
15. Use Scout Bee to update the Cloudflare and Hyper-V Compose profiles from the
    seeded predecessor or prior release candidate, including automatic
    backup-before-update and post-update verification.
16. Exercise an interrupted or failed update and verify safe resume, compatible
    application rollback, or full restore as appropriate.
17. Use Scout Bee to deploy and validate the released Compose profile on the
    approved Hyper-V Linux test VM.
18. Use Scout Bee to deploy and validate the Cloudflare family profile.
19. If the conditional adapter is included in the release candidate, use Scout Bee
    to deploy and validate the Compose profile on an Azure Linux VM.
20. Use the same MVP feature journey against the Cloudflare family profile, local
    Docker Compose, and Docker Compose on a supported cloud Linux VM.
21. Verify the released Compose package and instructions are compatible with the
    documented Azure, AWS, and GCP VM prerequisites.
22. Review the final logo, PWA icons, responsive designs, Lucidchart diagram catalog,
    accessible diagram exports, screenshots, and user/operator/developer docs.
23. Review deployment status, quota or resource information, diagnostics, security
    guidance, release notes, changelog, roadmap, compatibility policy, update and
    recovery instructions, and known limitations.

## Success Measures

ApiaryLens does not enable product analytics by default. MVP evaluation uses
explicit UAT results, automated test evidence, and opt-in user research.

- 100% of the critical UAT journey passes
- Zero lost or duplicate accepted mutations in the required synchronization suite
- Zero unresolved critical or high security findings without owner disposition
- First owner to first completed inspection in ten minutes or less during observed
  UAT, excluding infrastructure provisioning time
- Backup and clean-environment restore complete successfully using published steps
- Update from the seeded predecessor or previous supported release passes on
  Cloudflare, Hyper-V Compose, and the supported Compose-on-cloud-VM reference path
- A failed or interrupted update passes its documented resume, compatible rollback,
  or full-restore recovery test
- Every UAT build is traceable from the running Version and Build view to its release
  manifest, source, artifacts, contracts, migrations, notes, and known limitations
- Cloudflare and Compose backends pass the same release-scope domain,
  authorization, synchronization, and export conformance suite
- Local Compose and the documented Azure, AWS, and GCP Compose environments pass the
  supported installation and primary functional acceptance suite
- Measured family-cloud usage and Compose resource requirements are published with
  their date and assumptions
- All release-required brand, UX, diagram, flowchart, and documentation artifacts
  are approved, cataloged, accessible, and synchronized with released behavior

## UAT Timing

The first project-owner UAT checkpoint is targeted for 2026-07-16. That checkpoint
should exercise the primary end-to-end family journey as early as possible. It does
not waive any P0 release gate or convert explicitly excluded roadmap work into MVP
scope. Any limitation in the checkpoint build must be visible and recorded rather
than represented as completed functionality.

## Blocking Decisions Before Implementation

- ADR 0003 and the project license are accepted; preserve their constraints
- Select the frontend/PWA and offline-storage approach
- Select backend runtimes and define shared domain boundaries
- Select PostgreSQL data access for Compose and validate D1 or another accepted
  relational implementation for Cloudflare
- Define authentication, recovery, authorization, and session behavior
- Define synchronization and conflict behavior
- Define media storage and processing behavior
- Define deployment-plan, Scout Bee, secret, backup, update, and rollback contracts
- Define the product version, release manifest, API and sync compatibility,
  migration, PWA activation, release channel, and support-window contracts
- Complete the release-scope threat model and data model

These decisions may be completed autonomously under the project owner's
authorization, but their evidence and ADRs must still be recorded before dependent
implementation.

## Change Control

After approval, adding an MVP requirement requires one of:

- Removing or deferring an item of comparable effort
- Moving the UAT or release target
- Explicit project-owner approval of the expanded scope

P1 and future capabilities must not delay an otherwise releasable MVP.

## Related Documents

- [Product Brief](product-brief.md)
- [Product Capability Overview](product-capability-overview.md)
- [Master Architecture and Design Plan](../architecture/architecture-design-plan.md)
- [Installation and Deployment Experience](../architecture/installation-and-deployment-experience.md)
- [Versioning, Release, and Update Lifecycle](../architecture/versioning-release-and-update-lifecycle.md)
- [Deployment, PWA, and Cost Test Strategy](../testing/deployment-test-strategy.md)
- [Roadmap](../roadmap/roadmap.md)
- [ADR 0003: Open Source and Self-Hosted First](../adr/0003-open-source-first.md)
- [ADR 0007: Deployment Profile Priority](../adr/0007-deployment-profile-priority.md)
