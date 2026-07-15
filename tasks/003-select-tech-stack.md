# Task 003: Select Technology Stack

## Status

Completed 2026-07-15.

The accepted stack is recorded in
[ADR 0008](../docs/adr/0008-mvp-application-platform.md), with storage, identity,
synchronization, and deployment decisions in ADRs 0009 through 0011.

Selected MVP platform:

- React + TypeScript + Vite PWA
- Dexie/IndexedDB local replica and outbox
- Accessible shared design-system primitives
- Hono + Zod/OpenAPI on Cloudflare Workers and Node 24
- D1 and Node SQLite behind shared schema/repository contracts
- Private R2 and filesystem media adapters
- pnpm workspace, Vitest, and Playwright
- Docker Compose for the first complete self-hosted server and portable cloud fallback
- Cloudflare-native family profile as the first cloud target
- Cloudflare Workers Static Assets for official public frontends
- PWA first; the committed iPhone client remains post-MVP

The selection considered licensing, offline behavior, accessibility, resource
footprint, security, Cloudflare/Compose parity, self-hosting, updates, and support.
See the dated
[application platform research](../docs/research/2026-07-15-application-platform-and-storage-spike.md).

Implementation and release measurements remain required; a failed acceptance gate
changes the affected profile rather than weakening the accepted principles.
