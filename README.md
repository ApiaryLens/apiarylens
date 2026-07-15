# ApiaryLens

**ApiaryLens** is an open-source, self-hosted apiary intelligence and hive management
platform for beekeepers — from a single backyard hive to a commercial apiary operation.

This repository is the base monorepo. It is currently a **foundation-only scaffold** —
no application code has been written yet. See [`AGENTS.md`](AGENTS.md) for the
project's direction and ground rules if you're an AI coding agent working in this repo.
The authoritative assembled technical direction is the
[Master Architecture and Design Plan](docs/architecture/architecture-design-plan.md).

---

## Principles

ApiaryLens is built around a small set of non-negotiable principles. These apply to
every decision made in this repo, including tech stack choices that haven't been made
yet:

- **Open source first** — the core platform is and will remain open source.
- **Self-hosted first** — a beekeeper can run their entire hive record on their own
  hardware with no cloud dependency, and no account with anyone.
- **Offline-first PWA** — the primary client must work fully offline (spotty or no
  signal in the field is the normal case, not the edge case) and sync when connectivity
  returns.
- **Privacy-first** — hive data, location data, and yield data are the beekeeper's own.
  Nothing is collected, transmitted, or monetized without explicit opt-in.
- **AI-assisted, not AI-required** — AI features (e.g. inspection note parsing, health
  anomaly detection) are optional enhancements layered on top of a platform that is
  fully useful without them.
- **SaaS-capable later** — the architecture should not preclude an optional hosted
  offering down the road, but self-hosting is never a second-class experience.
- **Grows with the beekeeper** — the same platform should serve one hive in a backyard
  and hundreds of hives across a commercial apiary, without a rewrite in between.

## Status

Early scaffold. Structure and direction only — see [Project direction](#project-direction)
below. No app code, no chosen backend, no released version.

## Project direction

The following is **direction, not a locked decision**. Nothing below is final until an
ADR is written and merged under `docs/`.

| Layer | Likely direction |
|---|---|
| Frontend | React + TypeScript + Vite |
| Mobile | Progressive Web App first; committed iPhone App Store client later, with implementation approach decided by ADR |
| Backend | Undecided |
| Database | PostgreSQL (likely) |
| Deployment | Docker Compose first; other orchestration options considered later |
| Official public frontend hosting | Cloudflare Workers Static Assets (accepted) |

## Repository layout

```text
apiarylens/
├── .github/      # Repository-specific issue, PR, and CI configuration
├── apps/         # Deployable applications (web client, API, etc. — none yet)
├── packages/     # Shared libraries consumed by apps/ (none yet)
├── docs/         # Architecture notes, ADRs, design docs
├── tasks/        # Working task breakdowns for planned work
├── prompts/      # Reusable prompts for AI coding agents working in this repo
├── docker/       # Docker Compose and container definitions
├── scripts/      # Repo automation and dev tooling
├── AGENTS.md     # Direction and rules for AI coding agents
├── README.md     # This file
├── LICENSE       # Placeholder — license not yet finalized
├── CONTRIBUTING.md
├── SECURITY.md
└── CODE_OF_CONDUCT.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The project isn't ready for feature
contributions yet (no app code exists), but issues and discussion on direction are
welcome.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## License

A license has not been finalized yet. See [LICENSE](LICENSE).
