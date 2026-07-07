# ADR 0002: Domain Strategy

## Status

Proposed

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

## apiarylens.org

Primary open-source project home.

Use for:

- Project website
- Public docs
- Install guide
- Roadmap
- Community
- GitHub links
- Bee club onboarding
- Family/friends overview

Recommended DNS:

```text
apiarylens.org
www.apiarylens.org
docs.apiarylens.org
demo.apiarylens.org
```

## apiarylens.com

Commercial/defensive domain.

For now:

```text
apiarylens.com -> apiarylens.org
www.apiarylens.com -> apiarylens.org
```

Future possible use:

- Commercial landing page
- Hosted SaaS
- Support plans
- Sponsors
- Partner ecosystem

## apiarylens.app

Future app/PWA identity.

For now:

```text
apiarylens.app -> apiarylens.org
```

Future possible use:

- Hosted app entry point
- PWA install landing page
- Demo app
- SaaS login portal
- Mobile app landing page

## apiarylens.dev

Developer ecosystem domain.

Future possible use:

- API docs
- SDK docs
- Plugin docs
- Contributor docs
- ADRs
- Developer portal

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
- `.com` stays available for defensive/commercial use without making SaaS the default posture.
- `.app` remains reserved for a future hosted app, demo, or PWA entry point.
- `.dev` can become the developer documentation and plugin/API ecosystem home.