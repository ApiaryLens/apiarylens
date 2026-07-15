# Deployment, PWA, and Cost Test Strategy

## Purpose

Prove that ApiaryLens is easy, reliable, portable, and affordable for a family while
remaining suitable for self-hosted and larger deployments. Account names,
credentials, private resource names, and maintainer-specific infrastructure are not
part of this public strategy.

## Primary Acceptance Persona

The primary acceptance journey is a family with a small apiary using iPhones, iPads,
and computers. They expect one synchronized hive record, offline field operation,
simple updates, recoverable data, and little or no recurring cost.

## Test Environments

| Environment class | Purpose |
|---|---|
| Local browser and device | PWA installation, offline workflows, storage, media, accessibility, and responsive UI |
| Personally controlled Linux host or VM | Primary Compose self-hosted installation, upgrades, backup/restore, resource use, and portability |
| Windows host or VM | Scout Bee, local installation, filesystem, firewall, update, and uninstall behavior |
| Provider-neutral cloud Linux VM | Second cloud target using Compose; always-on family synchronization, portability, and baseline hosted cost |
| Cloudflare public frontends | Required preview/production builds, custom domains, TLS, caching, security headers, rollback, and property isolation |
| Cloudflare-native family backend profile | First cloud target; validate low-idle-cost deployment, quotas, portability, D1/R2 implications, and operational limits |
| Azure-style hosted profile | Evaluate portable container/VM deployment, managed services, identity options, and cost controls |
| iPhone and iPad | Safari behavior, Add to Home Screen, offline launch, media capture, updates, and synchronization |
| Desktop browsers | Current Safari where available, Chrome, Edge, and Firefox behavior |

Provider-specific environments are evidence generators. Passing a test in one
maintainer account does not make that provider or account a product dependency.

## Test Layers

### Fast automated tests

- Domain and business rules
- Serialization and migration logic
- Synchronization operations, idempotency, and conflict policies
- API contracts and generated clients
- Deployment-plan schema validation
- Configuration and secret-reference validation
- Cost-estimation functions and quota guards

### Integration tests

- PWA local store against synchronization API
- Database migrations from every supported release
- Product release-manifest, build-identity, API/sync/schema/deployment/export version
  agreement and incompatible-version rejection
- PWA service-worker activation and local-store migrations with active or pending
  offline work
- Media capture, compression, queueing, upload, retry, and export
- Authentication expiry and recovery while offline
- Backup creation and restore into a fresh installation
- Scout Bee plan generation and executor behavior
- Compose health checks, volumes, upgrades, and rollback
- Optional object-storage and external secret-manager adapters
- Cloudflare frontend build, preview, production approval, custom-domain, and rollback workflows
- Secure first-owner bootstrap, password hashing, recovery, session rotation,
  revocation, expiration, and throttling
- CSRF, CORS, origin, host, reverse-proxy, and forwarded-header protections
- Organization-isolation and cross-tenant negative authorization cases for every
  protected resource type
- OIDC interoperability and native-client Authorization Code with PKCE when those
  profiles are implemented

### End-to-end journeys

1. Try the public demo without exposing real user information.
2. Install the PWA on an iPhone or iPad.
3. Create a family, apiary, hive, and first inspection.
4. Record an inspection and photos with no network.
5. Reconnect and synchronize without duplicated or lost records.
6. View the same hive from a second family device.
7. Back up, restore, and export all data and media.
8. Upgrade the server and PWA without losing pending offline work.
9. Recover from the synchronization server being unavailable.
10. Move from the reference cloud profile to another supported deployment without
    losing portable data.
11. Run equivalent domain, authorization, synchronization, and export conformance
    journeys against Cloudflare-native and Compose server profiles.

## Offline and Failure Scenarios

- First launch online, later launch offline
- Server unavailable for hours or days
- Device backgrounded or terminated during synchronization
- Duplicate submissions and delayed retries
- Two family members edit the same inspection or hive
- Clock skew and reordered operations
- Storage quota or free-tier quota reached
- Media upload interrupted repeatedly
- Authentication expires while inspections remain pending
- Schema upgrade with an unsynchronized local queue
- Host sleeps, reboots, loses power, or runs out of disk
- Partial upgrade and failed migration

Failures must be visible and recoverable. The application must not silently discard
user work or create surprise charges to restore service.

## Installation and Lifecycle Tests

Every supported deployment profile must test:

- Clean install
- Guided first-run configuration
- Re-running installation safely
- Upgrade from the previous supported version
- Upgrade from a seeded predecessor when validating the first public release
- Automatic pre-upgrade backup
- Release artifact signature, checksum, provenance, and immutable-identity checks
- Interrupted update resume
- Failed update with compatible application rollback
- Irreversible migration with explicit full-restore recovery
- Post-update version, health, authentication, media, synchronization, and
  organization-isolation verification
- Backup verification and full restore
- Configuration export and import
- Diagnostics bundle with secrets removed
- Uninstall with explicit keep-data or remove-data choices
- Reinstallation against preserved data
- Device-only no-auth service remains bound to loopback
- Startup and Scout Bee reject no-auth network exposure, networked credential
  exchange over plaintext, missing production secrets, default credentials, and
  public HTTP
- Internet profile obtains, renews, and recovers trusted TLS without exposing secrets
- Credential and signing-key rotation preserves supported sessions and recovery paths

## Security Verification

- Maintain a versioned mapping of applicable OWASP ASVS 5.0 requirements to design,
  implementation, tests, or documented non-applicability.
- Run secret scanning, dependency review, static analysis, and container-image
  vulnerability scanning in CI.
- Test authentication enumeration, brute-force throttling, CSRF, session fixation,
  revocation, recovery abuse, invitation abuse, and public-link scope.
- Test authorization with a user from another organization, a removed member, each
  role boundary, direct object identifiers, media URLs, exports, and backups.
- Verify secrets are absent from source, logs, URLs, deployment-plan JSON,
  diagnostics bundles, images, and published artifacts.
- Generate and verify release SBOMs, checksums, signatures, and provenance.
- Perform threat-model review before enabling public sharing, plugins, remote access,
  or a hosted service.

## Cost Test Model

Before declaring a family cloud profile supported, measure at least:

- Idle monthly cost
- Two to five active family members
- Small, medium, and photo-heavy apiaries
- Database, media, request, log, build, backup, and egress use
- Free allowance exhaustion behavior
- Predictable paid fallback cost
- Cost of retained backups
- Cost with optional AI disabled, which is the default

Publish assumptions, date, region, provider, measured usage, and excluded costs.
Never advertise permanent free hosting based solely on a provider's current offer.

The reference profile should prefer hard quotas or graceful service limits over
unbounded billing. Data export and backups must continue to be accessible when a
quota is reached wherever the provider permits it.

## Device and PWA Quality Gates

- Installable on supported iPhone and iPad versions through documented steps
- Installable on supported desktop browsers
- Useful offline after installation
- Clear local, pending, synchronized, conflicted, and failed states
- Touch targets and contrast usable outdoors
- Camera and image selection work through supported browser capabilities
- Update prompts do not discard in-progress inspections
- Client/server compatibility failures are clear and never strand pending local work
- Layout works on phone, tablet, laptop, and desktop sizes
- Accessibility tested to WCAG 2.1 AA or better
- No required feature depends on push notifications or native-only APIs

## Release Gates

A release is not ready for family use until:

- The primary family journey passes on at least one supported iPhone, iPad, and desktop browser.
- Offline and synchronization recovery scenarios pass.
- Backup and restore are verified against a fresh installation.
- The supported Linux server profile passes install and upgrade tests.
- Cloudflare and Compose profiles pass update, failed-update recovery, release
  manifest, and build-traceability tests.
- A PWA with pending offline work survives a compatible client and server update and
  synchronizes exactly once.
- Published resource requirements and cost estimates match measured evidence.
- No test-only maintainer service is required by the released artifacts.
- Known provider limits and unsupported paths are documented.
- The security verification mapping passes for the release scope with no unresolved
  critical or high-severity finding lacking explicit maintainer disposition.
- Published artifacts and images have verified checksums, SBOMs, signatures, and
  provenance.

Native Apple packaging is a later release track. The PWA remains the primary client
foundation. The committed iPhone App Store client requires a separate ADR and
signing/release process, and must pass connection tests against a self-hosted server,
the near-free family reference profile, and any future managed service without
changing backend behavior.
