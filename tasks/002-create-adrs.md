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
- Near-free family-cloud backend profile
- Public frontend framework, content, and generation conventions within the accepted
  Cloudflare hosting boundary
- Future native-client implementation and App Store delivery
- Optional AI provider architecture

Update the master architecture and every affected supporting document in the same
change that accepts or supersedes an ADR. Do not implement dependent code first.
