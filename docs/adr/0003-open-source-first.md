# ADR 0003: Open Source and Self-Hosted First

## Status

Proposed

## Decision

ApiaryLens will launch as an open-source, self-hosted product.

SaaS may happen later, but must not be required for the core product.

## Consequences

- Docker Compose is the first complete server deployment target for personally
  controlled hardware and the portable cloud fallback. The ranked cloud deployment
  profiles are defined by [ADR 0007](0007-deployment-profile-priority.md).
- No required paid cloud dependency.
- AI integrations are optional.
- Data export is required.
- Multi-tenant design should be possible, but not SaaS-first.
