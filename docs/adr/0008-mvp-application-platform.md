# ADR 0008: MVP Application Platform

## Status

Accepted

## Date

2026-07-15

## Acceptance

Accepted under the project owner's authorization to complete remaining design and
implementation after accepting ADR 0003 and the MVP contract.

## Context

ApiaryLens needs one small, understandable codebase that can serve an offline PWA
and the same versioned API from Cloudflare or a self-hosted Linux container. The
family profile must fit low free-tier limits, while the Compose profile must run on
modest personal hardware without a separate application, database, queue, and
identity-provider fleet.

The initial plan listed React, Vite, PostgreSQL, FastAPI, and NestJS as candidates.
That mix would require separate JavaScript and server ecosystems and would not
directly fit Cloudflare Workers. PostgreSQL remains a useful later scale adapter,
but requiring it for a two-hive family would add installation and operational
weight without providing an MVP capability that SQLite cannot support.

## Decision

The MVP uses a TypeScript monorepo managed with pnpm.

- The client is React, TypeScript, Vite, and an installable service-worker PWA.
- The HTTP API uses Hono and Web Standard request/response primitives.
- The same API and domain packages run in Cloudflare Workers and in Node.js 24 LTS.
- The portable server uses `@hono/node-server` and Node's built-in `node:sqlite`.
- The Cloudflare profile uses Workers Static Assets and D1.
- Zod schemas are the runtime contract source and generate an OpenAPI 3.1 document
  through Hono's OpenAPI integration.
- Vitest covers units, contracts, and adapters; Playwright covers browser and PWA
  journeys.
- No independent background worker or queue is required for MVP. Client-side image
  preparation and request-driven work cover accepted scope. Durable jobs are added
  only when a measured feature needs them.

The monorepo has these initial deployable applications:

| Application | Responsibility |
|---|---|
| `apps/web` | Offline-first PWA and responsive user interface |
| `apps/server` | Node/Compose API, static assets, SQLite, and filesystem media |
| `apps/worker` | Cloudflare API, static assets, D1, and R2 adapter composition |
| `apps/scout` | Scout Bee React interface and local deployment executor |

Shared packages contain domain rules, API contracts, database schema/migrations,
storage interfaces, synchronization, UI primitives, configuration, and release
metadata. A package is created only when more than one application consumes it.

Runtime-specific code is restricted to composition roots and adapters. Domain and
API contract packages must not import Cloudflare, Node filesystem, or database
driver types. Conformance tests run the same behavior against both supported
profiles.

## Consequences

- One language and contract model reduces duplication across browser, Worker, and
  portable server code.
- Hono's Web Standards model minimizes runtime-specific API code.
- Node 24 is the first Compose runtime and is pinned in container and toolchain
  metadata; developers may use a compatible newer release only when CI proves it.
- PostgreSQL is not an MVP dependency. A future adapter can be introduced through a
  new ADR when organization-scale measurements justify it.
- A dedicated job runner is deferred; adding scheduled integrations, video
  processing, or AI requires a follow-up decision.
- Dependency licenses must remain compatible with Apache-2.0 and be recorded in the
  release SBOM and third-party notices.

## References

- [Application platform research](../research/2026-07-15-application-platform-and-storage-spike.md)
- [Hono documentation](https://hono.dev/docs/)
- [Node.js SQLite documentation](https://nodejs.org/api/sqlite.html)
- [Vite documentation](https://vite.dev/guide/)
- [ADR 0007](0007-deployment-profile-priority.md)

