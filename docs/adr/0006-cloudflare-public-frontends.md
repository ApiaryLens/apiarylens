# ADR 0006: Cloudflare Hosting for Public Frontends

## Status

Accepted

## Date

2026-07-15

## Context

ApiaryLens has three public frontend properties and one redirecting domain:

- `apiarylens.org` for the public project and documentation experience
- `apiarylens.app` for the hosted PWA, demo, and possible future managed service
- `apiarylens.dev` for developer documentation and tooling
- `apiarylens.com` reserved for commercial use and redirected to `.org` for now

The project needs a consistent, low-operations hosting, preview, custom-domain, TLS,
and edge-delivery platform for these public frontends. This hosting decision must
not make Cloudflare a required backend, database, identity, or self-hosting service.

## Decision

Host all official ApiaryLens public frontends on Cloudflare. For new projects, use
Cloudflare Workers Static Assets as the default deployment target, with custom
domains, managed TLS, preview deployments, and repository-connected builds where
appropriate.

This decision covers:

- The `.org`, `.app`, and `.dev` frontend build artifacts
- The `.com` to `.org` redirect
- Public frontend DNS, certificate, caching, security-header, and edge-delivery
  configuration where Cloudflare manages the applicable zone
- Preview and production frontend deployment workflows

This decision does not select the frontend framework. React, Vite, a static-site
generator, a documentation generator, or another build system may be chosen through
the appropriate research and ADR as long as it produces a supported Cloudflare
deployment artifact.

This decision also does not require the ApiaryLens API, PostgreSQL database, media
store, identity system, or synchronization backend to run on Cloudflare. A
Cloudflare-native family backend using Workers, D1, R2, KV, or related services is a
separate deployment-profile design. [ADR 0007](0007-deployment-profile-priority.md)
makes it the first cloud implementation target, subject to measured research and
follow-up technical decisions. The portable server and self-hosted Docker Compose
path remain first-class and operate without a Cloudflare account.

## Alternatives Considered

### Delay hosting selection

This preserves flexibility but creates avoidable uncertainty across three frontend
repositories, domain configuration, CI, previews, and security headers.

### Use different hosts for each property

This permits per-site optimization but increases operational, credential, and
workflow complexity before the sites have requirements that justify it.

### Make the complete product Cloudflare-native

This could reduce idle hosted cost, but it would couple the core backend and data
architecture to Cloudflare and conflict with the portable self-hosted-first
requirement unless maintained as an optional adapter or deployment profile.

## Consequences

- All public-facing frontend repositories share a Cloudflare deployment convention;
  their source repositories remain private.
- Frontend preview, custom-domain, TLS, and edge behavior can be standardized.
- Cloudflare configuration and credentials remain deployment concerns, never
  requirements for building or self-hosting the core product.
- Cloudflare is the first family-cloud profile target, while its backend framework,
  data, media, quota, backup, and portability decisions remain open.
- If Cloudflare product recommendations change, the implementation may move between
  Cloudflare frontend services without changing the durable platform decision.

## References

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare frontend deployment guidance](https://developers.cloudflare.com/use-cases/web-apps/deploy-frontend/)
- [Cloudflare Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
