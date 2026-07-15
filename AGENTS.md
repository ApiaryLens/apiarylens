# ApiaryLens — Agent instructions

This file is for AI coding agents (Claude Code, Codex, Copilot, or any other assistant)
working in this repository. Human contributors should also read [CONTRIBUTING.md](CONTRIBUTING.md).

## What this repo is

The base monorepo for **ApiaryLens** — an open-source, self-hosted apiary intelligence
and hive management platform for beekeepers. The MVP architecture is accepted and
implementation began on 2026-07-15. Check the current tree and release status before
assuming an application, package, or deployment is complete.

## Non-negotiable direction

Every change proposed or made in this repo must be consistent with all of the
following. If a task seems to require violating one of these, stop and flag it instead
of proceeding:

1. **Open source first.** No proprietary dependencies or vendor lock-in baked into the
   core platform.
2. **Self-hosted first.** A single beekeeper must be able to run the whole stack
   locally (Docker Compose) with zero required cloud services and zero required
   third-party accounts.
3. **Offline-first PWA.** The primary client is a Progressive Web App. It must remain
   fully usable with no network connection, syncing when connectivity returns. Do not
   design features that hard-require a live connection unless there is genuinely no
   offline-capable alternative.
4. **Privacy-first.** No telemetry, analytics, or data egress by default. Anything that
   sends data off the user's own infrastructure must be explicit opt-in.
5. **AI-assisted, not AI-required.** Any AI-powered feature must degrade gracefully —
   the platform is fully functional with AI features absent or disabled.
6. **SaaS-capable later, not required now.** Don't design against a future hosted
   offering, but don't build one either. Self-hosting must never become the
   second-class path.
7. **Scales from one hive to a commercial apiary.** Avoid designs that only work at
   hobbyist scale (e.g. assuming a single user, a handful of hives) or that only work
   at commercial scale (e.g. requiring a dedicated ops team). Both must be first-class.
8. **Secure by exposure.** Password-optional operation is permitted only when
   ApiaryLens is genuinely device-only. LAN, VPN, tunnel, and public reachability
   require authentication and encrypted transport; internet-facing access requires
   normal publicly trusted HTTPS. Secure defaults must not require a proprietary
   security service.

## Accepted MVP technology

ADRs 0008 through 0011 select the implementation below. Change a durable choice
through a new ADR; do not silently substitute a framework, database, identity
service, synchronization model, or deployment executor.

| Layer | Selection | Status |
|---|---|---|
| Frontend | React + TypeScript + Vite, service-worker PWA, Dexie/IndexedDB | Accepted |
| Mobile | PWA first; committed iPhone App Store client later, with wrapper/native approach still open | Direction committed; implementation open |
| Backend | Hono + Zod/OpenAPI on Cloudflare Workers and Node 24 | Accepted |
| Database | Shared SQLite schema: D1 on Cloudflare, `node:sqlite` in Compose | Accepted |
| Media | Private R2 on Cloudflare, private filesystem volume in Compose | Accepted |
| Identity | Built-in accounts and secure opaque sessions; optional OIDC later | Accepted |
| Self-hosted server deployment | Docker Compose on personally controlled hardware | Accepted MVP target |
| Cloud deployment | Cloudflare-native family profile first; Compose on a Linux VM second | Accepted MVP targets |
| Official public frontend hosting | Cloudflare Workers Static Assets | Accepted |
| Scout Bee | Embedded React UI with Go loopback executor and versioned plan | Accepted |

See [`docs/adr/0008-mvp-application-platform.md`](docs/adr/0008-mvp-application-platform.md)
through [`docs/adr/0011-scout-bee-and-deployment-execution.md`](docs/adr/0011-scout-bee-and-deployment-execution.md).

## Repository structure and how to use it

- `apps/` — deployable PWA, Node server, Cloudflare Worker, and Scout Bee applications.
- `packages/` — shared code consumed by multiple apps. Don't create a package for
  something only one app uses.
- `docs/` — architecture notes and ADRs. Any non-trivial technical decision (stack
  choice, data model, sync protocol, auth approach) should get an ADR here before
  being implemented.
  [`docs/architecture/architecture-design-plan.md`](docs/architecture/architecture-design-plan.md)
  is the master architecture and design plan. Update it whenever an ADR changes the
  assembled architecture. Use `docs/research/` for spikes that reduce meaningful
  uncertainty before a decision.
- `tasks/` — working task breakdowns for planned work. If you're an agent picking up a
  larger piece of work, look here first for existing scoping before starting your own.
- `prompts/` — reusable prompts for driving AI agents on recurring ApiaryLens tasks
  (e.g. "scaffold a new package," "write an ADR"). Add to this folder when a prompt
  proves reusable rather than one-off.
- `docker/` — Compose files and container definitions for the self-hosted deployment
  path. This is the primary server deployment target — keep it working at all times
  once it exists.
- `scripts/` — repo automation and dev tooling (setup scripts, codegen, etc.).

## Working conventions

- Don't add a dependency, service, or infrastructure component that violates
  self-hosted-first (e.g. a SaaS-only auth provider with no self-hosted fallback).
- Don't add analytics/telemetry SDKs by default.
- Don't scaffold the iPhone client before the PWA, versioned API, authentication,
  and synchronization contracts are solid. The App Store client is committed to the
  roadmap, but native work is explicitly later rather than parallel MVP work.
- Keep the offline story in mind for any client-side feature: does it work with no
  network, and does it sync cleanly when the network returns?
- Treat a family or hobbyist beekeeper as the default MVP user. Installation,
  updates, backup, restore, and diagnostics must not require database, container,
  DNS, TLS, identity-provider, or cloud-billing expertise. Consult
  [`docs/architecture/installation-and-deployment-experience.md`](docs/architecture/installation-and-deployment-experience.md).
- Treat the approved version of
  [`docs/product/mvp-definition.md`](docs/product/mvp-definition.md) as the binding
  MVP scope and UAT contract. Every P0 capability must work across the supported
  Cloudflare and Compose profiles; P1 and explicitly excluded work must not delay
  MVP delivery.
- Treat safe platform updates as an MVP product workflow. Follow
  [`docs/architecture/versioning-release-and-update-lifecycle.md`](docs/architecture/versioning-release-and-update-lifecycle.md)
  for release identity, compatibility, backup-before-update, migrations, PWA
  pending-work protection, health verification, rollback, restore, and release
  documentation requirements.
- Do not implement AI integrations during the MVP. Preserve optional extension
  boundaries, but defer models, providers, image analysis, summaries,
  recommendations, and diagnostic assistance until the post-MVP roadmap.
- Treat an always-available, synchronized, zero or predictably near-zero-cost family
  PWA experience across iPhone, iPad, and computers as a primary product outcome.
  Use [`docs/testing/deployment-test-strategy.md`](docs/testing/deployment-test-strategy.md)
  for device, deployment, recovery, and cost acceptance criteria.
- Follow the deployment ordering accepted in
  [`docs/adr/0007-deployment-profile-priority.md`](docs/adr/0007-deployment-profile-priority.md):
  Docker Compose first for a complete server on personally controlled hardware;
  Cloudflare-native first for cloud; and Compose on an ordinary Linux VM second for
  cloud. Do not treat that priority as approval of an unresearched framework,
  database adapter, or permanent-free claim.
- Treat Cloudflare Workers Static Assets as the required deployment target for the
  official `.org`, `.app`, and `.dev` frontends. This does not authorize coupling
  the portable API, database, identity, media, or synchronization backend to
  Cloudflare; follow
  [`docs/adr/0006-cloudflare-public-frontends.md`](docs/adr/0006-cloudflare-public-frontends.md).
- Author all new or substantially revised diagrams and flowcharts in Lucidchart
  under the dedicated `ApiaryLens` Lucid folder. Catalog them and commit accessible
  public exports according to [`docs/diagrams/README.md`](docs/diagrams/README.md).
  Do not introduce new Mermaid or draw.io sources as authoritative diagrams.
- Never commit secrets, tokens, passwords, subscription IDs, connection strings,
  certificates, or private keys. Repository configuration may reference secret names
  and safe templates only.
- Do not expose a no-auth service beyond loopback, add default credentials, store
  long-lived bearer tokens in browser storage, or make a separate identity provider
  mandatory for the family profile. Follow
  [`docs/security/security-architecture.md`](docs/security/security-architecture.md)
  and follow ADR 0010 when choosing or reviewing authentication code.
- Treat authorization as a server-side boundary. Every organization-scoped query,
  object lookup, media operation, export, and administrative action requires
  organization-isolation and negative authorization tests.
- Keep the open-source product architecture completely separate from any maintainer's
  private governance, identity, vault, project-management, or infrastructure systems.
  Document portable interfaces and operator requirements here; keep private
  implementation details in `apiarylens-ops` or a future private infrastructure repo.
- Official graphics and branding may be produced with the maintainer's optional
  Studio Foundry workflow, but approved assets committed under `assets/` are the
  public build inputs and source of truth. Follow [`docs/brand/README.md`](docs/brand/README.md).
  Never make a private studio, AI provider, or maintainer account necessary to build
  or run ApiaryLens, and never send user hive data or media to that workflow.
- Treat final logos, application and PWA icons, UX flows, Lucidchart sources,
  accessible diagram exports, screenshots, and synchronized user, operator, and
  developer documentation as MVP release requirements rather than post-release
  cleanup.
- When a design introduces reusable, shareable, installable, or community-maintained
  assets, consult
  [`docs/architecture/community-galleries-and-registries.md`](docs/architecture/community-galleries-and-registries.md).
  The relevant design or ADR must record its gallery/registry impact, including when
  the conclusion is that no gallery or registry is needed.
- The public product uses Apache License 2.0. Review every dependency, bundled
  component, generated artifact, and asset for compatible licensing and provenance;
  do not add AGPL/SSPL, source-available, noncommercial, unlicensed, or proprietary
  runtime requirements without an accepted ADR and explicit distribution analysis.
- Do not claim a feature or profile is complete merely because its scaffold exists.
  Verify it against the accepted MVP contract and release gates.
