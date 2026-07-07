# ApiaryLens — Agent instructions

This file is for AI coding agents (Claude Code, Codex, Copilot, or any other assistant)
working in this repository. Human contributors should also read [CONTRIBUTING.md](CONTRIBUTING.md).

## What this repo is

The base monorepo for **ApiaryLens** — an open-source, self-hosted apiary intelligence
and hive management platform for beekeepers. As of this writing the repo contains
**only foundation files and folder structure — no application code**. Do not assume any
app, package, or backend exists yet; check before referencing one.

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

## Tech direction — not yet locked

The stack below is **likely direction**, documented so agents don't re-litigate it on
every task, but it is **not final**. Do not treat it as a decision that's already been
made; treat it as the current leaning.

| Layer | Likely direction | Status |
|---|---|---|
| Frontend | React + TypeScript + Vite | Leaning, not chosen |
| Mobile | PWA first, Capacitor wrapper later if native APIs are needed | Leaning, not chosen |
| Backend | Undecided | Open |
| Database | PostgreSQL | Leaning, not chosen |
| Deployment | Docker Compose | Leaning, not chosen |

If a task requires actually choosing one of these (e.g. scaffolding the first app),
propose the decision as an ADR under `docs/` for human review rather than silently
picking and building on top of it.

## Repository structure and how to use it

- `apps/` — deployable applications (web client, API service, etc.). Empty until the
  first app is scaffolded.
- `packages/` — shared code consumed by multiple apps. Don't create a package for
  something only one app uses.
- `docs/` — architecture notes and ADRs. Any non-trivial technical decision (stack
  choice, data model, sync protocol, auth approach) should get an ADR here before
  being implemented.
- `tasks/` — working task breakdowns for planned work. If you're an agent picking up a
  larger piece of work, look here first for existing scoping before starting your own.
- `prompts/` — reusable prompts for driving AI agents on recurring ApiaryLens tasks
  (e.g. "scaffold a new package," "write an ADR"). Add to this folder when a prompt
  proves reusable rather than one-off.
- `docker/` — Compose files and container definitions for the self-hosted deployment
  path. This is the primary deployment target — keep it working at all times once it
  exists.
- `scripts/` — repo automation and dev tooling (setup scripts, codegen, etc.).

## Working conventions

- Don't add a dependency, service, or infrastructure component that violates
  self-hosted-first (e.g. a SaaS-only auth provider with no self-hosted fallback).
- Don't add analytics/telemetry SDKs by default.
- Don't scaffold a mobile-native (Capacitor) shell before the PWA itself is solid —
  mobile-native is explicitly a "later" step, not parallel work.
- Keep the offline story in mind for any client-side feature: does it work with no
  network, and does it sync cleanly when the network returns?
- This repo doesn't have a chosen license yet (see `LICENSE`) — don't add dependencies
  whose license would conflict with likely OSS licensing (e.g. avoid AGPL-incompatible
  or fully proprietary libraries) until a license is chosen.
- No application code exists yet. If asked to "add a feature," first check whether the
  underlying app/package exists at all — if not, that's a scaffolding task, not a
  feature task, and should probably start with an ADR in `docs/`.
