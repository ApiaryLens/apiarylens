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

## Proposed Decision Awaiting Acceptance

- Open-source and self-hosted-first posture

## Decisions Requiring Research and ADRs

- Open-source license
- Frontend/PWA framework and offline persistence
- Backend framework and API approach
- Database, migrations, and data access
- Authentication, authorization, organization isolation, and optional OIDC
- Offline synchronization and conflict resolution
- Media storage and processing
- Background work and scheduling
- Local-network HTTPS and remote access
- Scout Bee packaging, updates, signing, and rollback
- Secrets and optional secret-manager adapters
- Release signing, SBOM, checksums, and provenance
- Cloudflare-native family-cloud runtime, D1/R2 adapters, quotas, backup, export,
  and migration within the accepted deployment priority
- Public frontend framework, content, and generation conventions within the accepted
  Cloudflare hosting boundary
- Future native-client implementation and App Store delivery
- Optional AI provider architecture

Update the master architecture and every affected supporting document in the same
change that accepts or supersedes an ADR. Do not implement dependent code first.
