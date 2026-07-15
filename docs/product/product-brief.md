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

## Initial Capability Direction

Discovery and ADRs will set the final MVP boundary. The current outcome-oriented
scope includes:

- Apiaries, hives, queens, equipment, inspections, health observations, treatments,
  feeding, harvests, and media
- A PWA that supports offline work and visible synchronization state
- Device-only personal use plus authenticated family synchronization
- Organization membership and server-enforced authorization
- Backup, restore, export, upgrades, and recovery
- Docker Compose as the first complete server deployment on owned hardware
- Cloudflare-native family cloud first, with Compose on a cloud VM as the portable fallback
- Guided Scout Bee deployment and a safe public demo
- Weather and bloom foundations that can grow into historical intelligence
- Optional AI and native clients only after the non-AI PWA and public contracts are mature

See the [Product Capability Overview](product-capability-overview.md) for the
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
