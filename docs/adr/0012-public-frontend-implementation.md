# ADR 0012: Public Frontend Implementation Convention

## Status

Accepted — 2026-07-15

## Context

ADR 0006 requires the official `.org`, `.app`, and `.dev` properties to deploy
independently through Cloudflare Workers Static Assets while preserving the portable
application and backend. Task 009 requires a reproducible shared convention without
creating divergent copies of product code, contracts, documentation, or brand assets.

The MVP does not need a server-rendering framework, hosted content service, or
Cloudflare-specific application runtime for these public presentation surfaces.

## Decision

- Use standards-based HTML, CSS, and TypeScript with Vite as the common build tool.
- Deploy each property independently with Wrangler and Workers Static Assets.
- Keep property content and configuration in its owning repository.
- Build `apiarylens.app` from the versioned core PWA artifact; do not fork the PWA.
- Generate the `.dev` OpenAPI artifact from `@apiarylens/contracts`; do not hand-copy it.
- Copy approved brand and marketing assets from the core repository during builds;
  generated copies are not additional sources of truth.
- Require local builds to work without a Cloudflare account. Cloudflare credentials are
  used only for preview or production deployment.
- Use explicit preview and production Wrangler environments, security headers, immutable
  hashed assets, and documented rollback by deployment version.

## Consequences

The three repositories remain small and independently deployable while sharing one
reviewed supply-chain and hosting convention. Contributors need the core checkout or a
released core artifact when building `.app` and `.dev`. A later ADR may introduce a
content or portal framework only if measured requirements justify the added dependency.

No Cloudflare service becomes necessary to build or self-host the ApiaryLens product.
