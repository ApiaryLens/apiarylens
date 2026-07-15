# Task 005: Define and Plan the MVP

## Status

Product scope defined on 2026-07-15 and awaiting project-owner approval. The
authoritative proposed scope and acceptance contract is
[ApiaryLens MVP Definition and UAT Contract](../docs/product/mvp-definition.md).

The ordered engineering implementation plan will be produced after ADR 0003 is
approved and the implementation-blocking research and ADRs are completed.

## MVP Outcome

A family or hobbyist can install and use the complete MVP through:

1. The Cloudflare family profile
2. Docker Compose on personally controlled hardware, including the Hyper-V UAT VM
3. Docker Compose on a supported Azure, AWS, or GCP Linux VM

Every approved MVP feature must have equivalent behavior across supported backend
profiles. The PWA, public properties, Scout Bee, brand assets, UX designs,
Lucidchart diagrams and flowcharts, accessible public exports, documentation,
security controls, deployment lifecycle, and release artifacts are part of the MVP
definition of done.

## Version and Update Boundary

Safe updates are part of MVP. A release must have one traceable product version,
exact build identity, a release manifest, versioned API and data contracts, curated
release notes, changelog, roadmap, support and compatibility information, and tested
upgrade and recovery paths.

Scout Bee performs guided backup-before-update, migrations, health verification,
resume, compatible application rollback, and full-restore guidance for its supported
targets. Direct Cloudflare and Compose procedures are also documented. The PWA must
preserve active and pending offline work across compatible client and server
updates. See
[Versioning, Release, and Update Lifecycle](../docs/architecture/versioning-release-and-update-lifecycle.md).

## Scout Bee Boundary

Scout Bee is a completed MVP component with deliberately limited target adapters:

- Required: Hyper-V Linux test VM using Docker Compose
- Required: Cloudflare family deployment
- Conditional for the first UAT checkpoint: Azure Linux VM using Docker Compose
- Not MVP: provider-specific AWS or GCP automation

The generic Compose package remains documented and supported on suitable Azure,
AWS, and GCP Linux VMs.

## Explicit Mobile Boundary

The installable PWA is the MVP client and must work on supported iPhone, iPad, and
desktop browsers. A native iPhone App Store application, native Android application,
or Capacitor/native wrapper is not part of the MVP.

## Remaining Planning Work

After MVP scope approval:

- Convert every P0 requirement and UAT step into ordered implementation tasks
- Associate each task with its prerequisite research, ADR, design, security, test,
  documentation, diagram, and deployment output
- Identify the smallest end-to-end UAT slice without weakening the final MVP gates
- Track P1 and excluded capabilities separately so they cannot delay MVP delivery
- Maintain traceability from requirement through implementation, automated tests,
  deployment evidence, documentation, and UAT result

Use the [Execution Plan](../docs/roadmap/execution-plan.md) for the gated sequence
from research through decisions, design, implementation, verification, deployment,
and release.
