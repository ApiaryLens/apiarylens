# ADR 0003: Open Source and Self-Hosted First

## Status

Proposed

## Date

2026-07-15

## Decider

Kristopher Turner, project owner

## Context

ApiaryLens is intended for beekeepers ranging from one person or a family with a
few hives through clubs, research teams, and commercial operations. A beekeeper's
apiary locations, hive health, treatments, production, media, and identity data can
be sensitive and must not be trapped in a hosted product or made inaccessible when
a subscription, provider, or maintainer service is unavailable.

The project also intends to offer an easy, always-available family cloud profile
and may operate a managed service in the future. Those experiences can reduce setup
and operational work, but they must not turn the self-hosted product into an
incomplete edition or make a third-party account a requirement for core operation.

The repository is currently public but the project license has not been selected.
Public source without an appropriate license is not sufficient to claim that the
released product is open source. The licensing decision therefore blocks acceptance
of this ADR and the first application dependency or release decision.

## Decision

ApiaryLens will be an open-source-first, self-hosted-first product. A complete,
supported deployment must run on personally controlled hardware without a required
cloud service, commercial subscription, external identity provider, AI provider,
telemetry service, or maintainer-private system.

The public open-source product includes all code and artifacts required to build,
run, secure, update, back up, restore, export, and migrate a supported self-hosted
deployment, including:

- The PWA, API, background worker, domain packages, and shared libraries
- Database schemas, migrations, and supported storage adapters
- Container build definitions, Docker Compose, health checks, and portable
  configuration contracts
- `Scout Bee`, the versioned deployment-plan schema, and user-owned deployment
  automation
- Authentication, authorization, organization-isolation, synchronization, media,
  backup, restore, export, and migration implementations
- Public API, OpenAPI, synchronization, deployment-connection, and portable data
  contracts
- Tests, security controls, release metadata, and operator documentation needed to
  verify supported behavior
- Provider-specific code or templates required for a user to deploy a supported
  user-owned profile, including the Cloudflare family profile when it is accepted
  as supported

The following may remain private because they operate official project properties
or the maintainer's business rather than the user-owned product:

- Internal project management, dashboards, governance, credentials, and runbooks
- Production account identifiers, secrets, signing material, and incident data
- Official hosted-environment configuration containing private operational values
- Future managed-service billing, support, and maintainer-only infrastructure
- Private Studio Foundry production workflows, provided every approved runtime or
  published asset needed by ApiaryLens is committed with appropriate provenance
- Source repositories for official `.org`, `.app`, and `.dev` web properties as
  established by ADR 0001, provided their private source is not required to build,
  run, understand, or self-host the product

Private operations must not contain a required product feature, migration, security
fix, data format, deployment tool, or recovery path that is withheld from
self-hosters. A future managed service may provide operational convenience and
service-level commitments, but it must use compatible public product contracts and
preserve export and migration paths.

The open-source and hosted paths follow these additional requirements:

- Offline field workflows remain functional without a live service.
- No analytics, telemetry, or external data transfer is enabled by default.
- AI features are optional and the core product remains useful without them.
- Users can export their relational data and media in documented portable formats.
- Security controls are equivalent by exposure and do not depend on a proprietary
  security provider.
- The architecture supports organization and tenant isolation without making SaaS
  the default operating model.
- Dependencies and build tools must have licenses compatible with the selected
  ApiaryLens license and distribution model.

Docker Compose is the first complete server target for personally controlled
hardware. A Cloudflare-native family profile is the first cloud target and Compose
on an ordinary Linux VM is the second, as accepted in
[ADR 0007](0007-deployment-profile-priority.md). Cloudflare's priority does not make
Cloudflare a requirement for the portable product.

## Alternatives Considered

### Proprietary or SaaS-first product

This could simplify centralized operations and monetization, but would conflict
with beekeeper data ownership, offline operation, user-controlled deployment, and
the project's community purpose. Rejected.

### Public source under a non-open-source or source-available license

This could permit viewing the code while restricting use, modification, or
distribution. It would not support an unqualified open-source claim and would
weaken community self-hosting and continuity. Rejected.

### Open core with required capabilities reserved for a paid edition

This could create a commercial upgrade path, but risks making self-hosting a
second-class product and splitting data, security, or migration contracts. Required
core hive-management, security, portability, and deployment capabilities will not
be withheld from the open-source product. Rejected.

### Open-source core with optional managed operations

This preserves a complete user-owned product while allowing a future paid service
to sell convenience, hosting, support, and operational commitments. Accepted.

## Consequences

- The exact project license must be selected and the placeholder `LICENSE` replaced
  before this ADR is accepted or application dependencies are committed.
- All dependencies, bundled components, assets, and generated artifacts require
  license and provenance review.
- The supported Cloudflare family profile and Compose profile require shared
  contracts and conformance tests so they do not become separate products.
- Self-hosted installation, upgrades, backup, restore, export, migration, and
  security are release requirements rather than community-only work.
- Future hosted revenue must come from operating convenience, support, or other
  compatible services rather than making user data or essential product behavior
  proprietary.
- Private repository boundaries require continuing review whenever infrastructure,
  galleries, registries, build systems, or hosted features are introduced.

## Open Item Blocking Acceptance

Select the ApiaryLens license and record:

- The license name and SPDX identifier
- Compatibility expectations for dependencies, assets, SDKs, and plugins
- Whether contributions use a Developer Certificate of Origin, a contributor
  license agreement, or another documented mechanism
- Copyright and third-party notice conventions

Once that decision is made, update this ADR with the license, replace the repository
license placeholder, reconcile contribution and security documentation, and return
the ADR to the project owner for acceptance.

## References

- [ADR 0001: Core Monorepo with Separate Properties and Operations](0001-project-structure.md)
- [ADR 0006: Cloudflare Hosting for Public Frontends](0006-cloudflare-public-frontends.md)
- [ADR 0007: Deployment Profile Priority](0007-deployment-profile-priority.md)
- [Master Architecture and Design Plan](../architecture/architecture-design-plan.md)
- [Repository Strategy](../architecture/repository-strategy.md)
- [Deployment Strategy](../deployment/deployment-strategy.md)
- [Security Architecture](../security/security-architecture.md)
