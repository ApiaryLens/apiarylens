# ApiaryLens Product Brief

## Product

ApiaryLens is an open-source, self-hosted, offline-first apiary intelligence and hive
management platform. It begins with a family or hobbyist managing a small number of
hives and is designed to grow into mentor, bee-club, research, and commercial use
without forcing users into a different product or hosted service.

## Problem

Field notebooks and disconnected photos make it difficult to remember hive history,
coordinate with family or mentors, recognize patterns, and prepare for the next
inspection. Existing digital tools can be expensive, online-only, difficult to
self-host, or too complicated for a new beekeeper.

ApiaryLens should make hive records dependable and understandable while preserving
the beekeeper's control of their data.

## Primary User and Outcome

The first target is a family or hobbyist beekeeper. A parent and child should be able
to start simply, record inspections and photos in the field without connectivity,
and see one synchronized family record from iPhones, iPads, and computers at zero or
predictably near-zero recurring cost.

Device-only operation, portable self-hosting, and a future optional managed service
remain first-class paths. A user should not need to understand containers,
databases, DNS, TLS, identity providers, or cloud billing to get started safely.

## Product Principles

- Open source and self-hosted first
- Offline-capable field workflows and explicit synchronization
- Privacy and data ownership by default
- Secure defaults based on deployment exposure
- AI-assisted, never AI-required
- Portable data, media, backups, and deployment artifacts
- Accessible and usable outdoors on phones and tablets
- One core product from one hive through commercial scale
- Easy installation, update, backup, restore, and diagnostics
- Traceable versions, plain-language release notes, and safe guided updates that
  preserve offline work and provide tested recovery

## MVP Boundary

The proposed [MVP Definition and UAT Contract](mvp-definition.md) is the
authoritative product-scope boundary awaiting project-owner approval. It requires a
complete installable offline-first PWA, equivalent MVP behavior across Cloudflare
and Compose backends, finished Scout Bee deployment for the Hyper-V UAT VM and
Cloudflare, portable cloud-VM support, and completed brand, UX, Lucidchart,
documentation, security, lifecycle, and release artifacts.

The native iPhone App Store application, Android application, AI, sensors,
commercial workflows, and other later capabilities are explicitly outside the MVP.
See the [Product Capability Overview](product-capability-overview.md) for the broader
capability narrative and the [Roadmap](../roadmap/roadmap.md) for delivery sequence.

## Public Properties

| Property | Purpose |
|---|---|
| `apiarylens.org` | Project, marketing, documentation, tutorials, releases, roadmap, and community |
| `apiarylens.app` | Hosted PWA, interactive demo, and possible future managed application |
| `apiarylens.dev` | API, SDK, integration, plugin, architecture, and contributor portal |
| `apiarylens.com` | Reserved commercial flexibility; redirects to `.org` for now |

All official public frontends deploy on Cloudflare. The portable core backend and
self-hosted product do not require Cloudflare.

## Portfolio

The public core monorepo owns product behavior, architecture, contracts, Compose,
and releases. Private repositories own the three independently deployed public
frontends, internal operations, and private organization configuration. The public
core repository carries its own community-health files because private `.github`
repositories do not provide organization-wide public defaults. Future SaaS
infrastructure, hardware, Helm, or gallery repositories require their own justified
boundaries and ADRs.

## Delivery

ApiaryLens moves through foundation, discovery and research, accepted decisions,
detailed design, implementation, verification, and release. See the
[Master Architecture and Design Plan](../architecture/architecture-design-plan.md),
[Execution Plan](../roadmap/execution-plan.md), and [Roadmap](../roadmap/roadmap.md).
