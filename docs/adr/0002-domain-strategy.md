# ADR 0002: Domain Strategy

## Status

Accepted

## Context

ApiaryLens owns:

- apiarylens.org
- apiarylens.com
- apiarylens.app
- apiarylens.dev

The project is open-source and self-hosted first, but it should preserve room for
public documentation, developer resources, a future app entry point, and possible
commercial support or SaaS later.

## Decision

Use the domains as follows.

The official public frontends and `.com` redirect are hosted on Cloudflare under
[ADR 0006](0006-cloudflare-public-frontends.md). That hosting decision does not make
Cloudflare a required ApiaryLens backend or self-hosting dependency.

## apiarylens.org

Primary open-source project home.

Use for:

- Public project and marketing website
- Documentation and how-to guides
- Tutorials and videos
- Downloads and installation guides
- Release information and changelogs
- Roadmap
- Community
- Self-hosting documentation
- GitHub links
- Bee club onboarding
- Family/friends overview

Recommended DNS:

```text
apiarylens.org
www.apiarylens.org
docs.apiarylens.org
```

## apiarylens.com

Commercial/defensive domain.

For now:

```text
apiarylens.com -> apiarylens.org
www.apiarylens.com -> apiarylens.org
```

Reserve for possible future commercial or company use, such as:

- Commercial landing page
- Support plans
- Sponsors
- Partner ecosystem

## apiarylens.app

The public demo identity and possible future application entry point.

Use for:

- The interactive public demo
- A future managed app or PWA entry point only after an explicit product decision
- A future optional SaaS service
- Future SaaS sign-in and onboarding if a managed service is approved
- Mobile app landing or install experiences

## apiarylens.dev

Developer ecosystem domain.

Use for:

- API docs
- OpenAPI reference
- SDK docs
- Plugin docs
- Integration docs
- Architecture documentation
- Contributor docs
- ADRs
- Developer portal
- Development tools and sandbox environments

Possible DNS:

```text
apiarylens.dev
api.apiarylens.dev
sdk.apiarylens.dev
plugins.apiarylens.dev
```

## Positioning

At launch:

```text
Open source first.
Self-hosted first.
Offline-first.
SaaS-capable later.
```

## Consequences

- The open-source project identity centers on `.org`.
- `.org` is the public home for learning about, deploying, and participating in the project.
- `.com` stays reserved for defensive or future commercial use and redirects to `.org` for now.
- `.app` is the permanent home of the interactive demo and may become a managed application entry point in the future.
- `.dev` is the developer documentation, API, integration, contributor, and tooling home.
- Each domain has a durable purpose that does not need to change as the project grows.
