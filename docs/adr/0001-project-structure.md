# ADR 0001: Core Monorepo with Separate Properties and Operations

## Status

Accepted

## Context

ApiaryLens needs one coherent open-source product codebase, separately deployed
public websites, a hosted demo and possible future SaaS application, developer
resources, and private internal operations. Only the core open-source repository
is public; the source repositories for official web properties remain private even
when their deployed sites are public. These concerns have different
visibility, deployment, contribution, and release requirements.

The project may also grow community galleries or registries for reusable assets,
data, integrations, or plugins. Those should become separate repositories only
when their contribution and operational boundaries justify it.

## Decision

Keep the open-source product in the main public monorepo:

```text
ApiaryLens/apiarylens
```

Use separate repositories for independently owned or deployed properties:

| Repository | Visibility | Responsibility |
|---|---|---|
| `apiarylens` | Public | PWA, API, worker, shared packages, database, Docker Compose, architecture, and ADRs |
| `apiarylens-ops` | Private | Internal project management, dashboards, planning, coordination, and operational procedures |
| `apiarylens.org` | Private | Marketing, public documentation experience, tutorials, releases, roadmap, and community site |
| `apiarylens.app` | Private | Hosted demo deployment, demo configuration, and safe seeded content; future application entry point |
| `apiarylens.dev` | Private | Developer portal, generated API reference, integrations, SDKs, plugins, and contributor resources |
| `.github` | Private | Organization configuration, shared community health files, templates, and reusable workflows |

The application source remains in `apiarylens`. Domain repositories consume
versioned product artifacts or generated documentation instead of duplicating the
product implementation.

Future production SaaS infrastructure, billing, monitoring, and sensitive
operational configuration may require a separate private repository such as
`apiarylens-cloud` or `apiarylens-infrastructure`. It must not be mixed into the
public demo merely because both are served under `apiarylens.app`.

[ADR 0005](0005-initial-repository-portfolio.md) activates and bootstraps this
initial repository set during the foundation phase. [ADR 0006](0006-cloudflare-public-frontends.md)
sets Cloudflare as the hosting platform for the public frontends without changing
the portable backend boundary in this decision.

## Future Galleries and Registries

Community galleries and registries are an explicit future architectural
consideration. Possible examples include inspection templates, report templates,
regional bloom datasets, equipment profiles, sensor integrations, provider
adapters, and plugins.

Do not create a gallery or registry repository merely to reserve a name. Create or
extract one when it has an independent contribution workflow, versioned schema,
validation and trust requirements, release or deployment lifecycle, or maintainer
boundary.

All relevant future designs and ADRs must consult
[`docs/architecture/community-galleries-and-registries.md`](../architecture/community-galleries-and-registries.md)
and record whether they create, consume, publish, or have no effect on reusable
community assets.

## Consequences

Benefits:

- Product code and contracts remain aligned in one public monorepo.
- Public sites can deploy from private source repositories and evolve independently.
- Private operations stay separate from open-source product development.
- Hosted deployments consume the same product released to self-hosters.
- Community ecosystems can be separated later using explicit extraction criteria.

Tradeoffs:

- Cross-repository releases require automation and version pinning.
- Documentation needs a defined source of truth to prevent duplication.
- More repositories add operational overhead as they are activated.
- Future SaaS infrastructure will need a deliberate public/private boundary.
