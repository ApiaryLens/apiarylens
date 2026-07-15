# Task 002: Maintain the Architecture Decision Set

## Goal

Ensure every durable project or technical choice is captured as an ADR before
dependent implementation begins.

## Accepted Foundation Decisions

- Repository boundaries
- Domain assignments
- Lucidchart diagram standard
- Initial repository activation
- Cloudflare hosting for official public frontends
- Deployment profile priority: Compose first on owned hardware, Cloudflare first in
  cloud, and Compose on a cloud VM second
- Open-source and self-hosted-first posture
- Apache-2.0 project license and DCO 1.1 contribution sign-off

## Decisions Requiring Research and ADRs

- Frontend/PWA framework and offline persistence
- Backend framework and API approach
- Database, migrations, and data access
- Authentication, authorization, and organization isolation
- Offline synchronization and conflict resolution
- Media storage and processing
- Background work and scheduling
- Local-network HTTPS and remote access
- Scout Bee packaging, updates, signing, and rollback
- Secrets and optional secret-manager adapters
- Release signing, SBOM, checksums, and provenance
- Product version source of truth, release manifest, channels, support window,
  independently versioned API/sync/migration/deployment/export contracts, PWA
  activation, update orchestration, and recovery policy
- Cloudflare-native family-cloud runtime, D1/R2 adapters, quotas, backup, export,
  and migration within the accepted deployment priority
- Public frontend framework, content, and generation conventions within the accepted
  Cloudflare hosting boundary

## Post-MVP Decisions

- Device-only personal mode and migration into family synchronization
- Optional OIDC federation and passkeys
- Native-client implementation and App Store delivery
- Optional AI provider architecture

Update the master architecture and every affected supporting document in the same
change that accepts or supersedes an ADR. Do not implement dependent code first.
