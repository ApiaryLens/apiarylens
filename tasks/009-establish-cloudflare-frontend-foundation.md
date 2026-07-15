# Task 009: Establish the Cloudflare Frontend Foundation

## Status

Implementation in progress. ADR 0012 accepts the shared Vite and Workers Static Assets
convention; local builds and deployment verification remain completion gates.

## Goal

Define and prove a shared, secure Cloudflare Workers Static Assets deployment
convention for `apiarylens.org`, `apiarylens.app`, and `apiarylens.dev`, plus the
temporary `apiarylens.com` redirect, without forcing the portable ApiaryLens backend
onto Cloudflare.

## Fixed Requirements

- Official public frontends deploy to Cloudflare.
- The `.org`, `.app`, and `.dev` repositories deploy independently.
- Preview and production environments use separate configuration and least-privilege
  credentials.
- No secret is committed to Git.
- Builds are reproducible locally without a Cloudflare account.
- Self-hosters can build and run the core product without Cloudflare.
- The `.app` PWA can call a portable API hosted elsewhere through an explicit,
  secure deployment-connection contract.

## Research and Design Questions

- Which frontend framework or documentation generator belongs in each repository?
- Which configuration should be shared and which should remain property-specific?
- How are custom domains, redirects, TLS, security headers, caching, CSP, and preview
  environments managed?
- How are approved brand assets and authoritative core documentation consumed without
  creating divergent copies?
- How are accessibility, performance budgets, link checking, and supply-chain checks
  enforced consistently?
- What Cloudflare account/project separation and credential scopes are required in
  private operations?
- How does `.app` select and securely connect to demo, family, self-hosted, and future
  managed backends?

## Outputs

- Shared Cloudflare frontend convention and ADR updates if implementation choices
  materially extend ADR 0006
- Reproducible local build and preview deployment for each property
- Environment, domain, redirect, header, caching, rollback, and incident runbooks
- CI templates with preview and production approval gates
- Cost/limit documentation based on dated Cloudflare primary sources
- Lucid public-property deployment and trust-boundary diagram with accessible export

## Acceptance Criteria

- Each property can deploy a harmless placeholder through the same reviewed convention.
- Preview deployment does not modify production domains.
- Production deployment requires an explicit protected approval path.
- Rollback to a known deployment is documented and tested.
- No backend portability or self-hosted requirement is weakened.
