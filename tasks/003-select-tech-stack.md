# Task 003: Select Technology Stack

Review the architecture docs and create final stack recommendations.

Current likely direction:

- React + TypeScript + Vite frontend
- Accessible design-system and styling candidates to be evaluated rather than assumed
- PWA first
- Committed iPhone client later; Capacitor, another wrapper, or native implementation remains open
- PostgreSQL
- Docker Compose for the first complete self-hosted server and portable cloud fallback
- Cloudflare-native runtime and storage adapters for the first cloud profile
- Backend framework undecided: FastAPI or NestJS
- Cloudflare Workers Static Assets for official public frontend hosting (already accepted)

Evaluate licensing, offline behavior, accessibility, resource footprint, security,
maintainer experience, Cloudflare frontend compatibility, self-hosting, upgrade
paths, and long-term support. Produce the relevant ADRs before installing dependencies.

Follow [ADR 0007](../docs/adr/0007-deployment-profile-priority.md) for deployment
order without treating the Cloudflare runtime, D1/R2 adapters, or PostgreSQL data
path as already selected technical implementations.
