# ApiaryLens

**ApiaryLens** is an open-source, self-hosted apiary intelligence and hive management
platform for beekeepers — from a single backyard hive to a commercial apiary operation.

This repository is the public product monorepo. The MVP architecture and UAT
contract are accepted, and implementation began on 2026-07-15. See
[`AGENTS.md`](AGENTS.md) for the project rules if you're an AI coding agent working
in this repo.
The authoritative assembled technical direction is the
[Master Architecture and Design Plan](docs/architecture/architecture-design-plan.md).
The accepted release scope is the
[MVP Definition and UAT Contract](docs/product/mvp-definition.md).
The accepted cross-profile versioning and safe-update contract is in
[Versioning, Release, and Update Lifecycle](docs/architecture/versioning-release-and-update-lifecycle.md).

---

## Principles

ApiaryLens is built around a small set of non-negotiable principles. These apply to
every decision made in this repo:

- **Open source first** — the core platform is and will remain open source.
- **Self-hosted first** — a beekeeper can run their entire hive record on their own
  hardware with no cloud dependency, and no account with anyone.
- **Offline-first PWA** — the primary client must work fully offline (spotty or no
  signal in the field is the normal case, not the edge case) and sync when connectivity
  returns.
- **Privacy-first** — hive data, location data, and yield data are the beekeeper's own.
  Nothing is collected, transmitted, or monetized without explicit opt-in.
- **AI-assisted later, not AI-required** — AI integrations are post-MVP optional
  enhancements layered on top of a platform that is fully useful without them.
- **SaaS-capable later** — the architecture should not preclude an optional hosted
  offering down the road, but self-hosting is never a second-class experience.
- **Grows with the beekeeper** — the same platform should serve one hive in a backyard
  and hundreds of hives across a commercial apiary, without a rewrite in between.

## Status

ApiaryLens `0.1.0-rc.7` is the corrective MVP acceptance candidate. The PWA,
Node and Cloudflare backends, Docker Compose profile, Scout Bee, release artifacts,
and public documentation are implemented. It is not a stable release: physical
iPhone/iPad, assistive-technology, AWS/GCP compatibility, and final project-owner
acceptance remain open in the [MVP UAT record](docs/testing/mvp-uat.md).

## Project direction

ADRs 0008 through 0011 accept the MVP implementation below.

| Layer | Accepted MVP selection |
|---|---|
| Frontend | React + TypeScript + Vite, service-worker PWA, Dexie/IndexedDB |
| Mobile | Progressive Web App first; committed iPhone App Store client later, with implementation approach decided by ADR |
| Backend | Hono + Zod/OpenAPI on Cloudflare Workers and Node 24 |
| Database | Shared SQLite schema: D1 on Cloudflare and `node:sqlite` in Compose |
| Media | Private R2 on Cloudflare and a private filesystem volume in Compose |
| Identity | Built-in local accounts and opaque sessions; optional OIDC later |
| Self-hosted server deployment | Docker Compose on personally controlled hardware |
| Cloud deployment | Cloudflare-native family profile first; Docker Compose on a Linux VM second |
| Official public frontend hosting | Cloudflare Workers Static Assets (accepted) |
| Scout Bee | Embedded React UI with a Go loopback executor |

## Repository layout

```text
apiarylens/
├── .github/      # Repository-specific issue, PR, and CI configuration
├── apps/         # Deployable PWA, server, Worker, and Scout Bee applications
├── packages/     # Shared domain, contract, data, sync, configuration, and UI code
├── docs/         # Architecture notes, ADRs, design docs
├── tasks/        # Working task breakdowns for planned work
├── prompts/      # Reusable prompts for AI coding agents working in this repo
├── docker/       # Docker Compose and container definitions
├── scripts/      # Repo automation and dev tooling
├── AGENTS.md     # Direction and rules for AI coding agents
├── README.md     # This file
├── LICENSE       # Apache License 2.0
├── CONTRIBUTING.md
├── SECURITY.md
└── CODE_OF_CONDUCT.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues, design discussion, documentation,
tests, and scoped implementation contributions are welcome.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## License

ApiaryLens is licensed under the
[Apache License, Version 2.0](LICENSE) (`Apache-2.0`). Contributions use
[Developer Certificate of Origin 1.1](CONTRIBUTING.md#developer-certificate-of-origin)
sign-off. Brand and third-party assets may carry separately recorded compatible
terms in their provenance manifests.
