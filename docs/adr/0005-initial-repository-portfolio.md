# ADR 0005: Activate the Initial Repository Portfolio

## Status

Accepted

## Date

2026-07-15

## Context

ADR 0001 defines separate repositories for the open-source product, private
operations, public project website, hosted application property, developer portal,
and organization-wide GitHub configuration. Only the open-source product repository
is public; the other repository sources are private even when they deploy public
websites. The original activation guidance
deferred several repositories until their implementation content existed.

ApiaryLens is now moving from direction capture into coordinated discovery,
research, design, implementation, deployment, and public-site delivery. Establishing
the repository boundaries first makes ownership and cross-repository planning
explicit and prevents later work from accumulating in the wrong source of truth.

## Decision

Activate and bootstrap the complete initial repository portfolio during the project
foundation phase:

| Repository | Visibility | Initial state |
|---|---|---|
| `apiarylens` | Public | Existing core product monorepo and architecture source of truth |
| `apiarylens-ops` | Private | Internal planning, portfolio coordination, dashboards, runbooks, and private operations |
| `apiarylens.org` | Private | Project, marketing, documentation, tutorial, release, roadmap, and community frontend |
| `apiarylens.app` | Private | Hosted PWA/demo frontend and safe public deployment configuration |
| `apiarylens.dev` | Private | Developer portal, generated API reference, SDK, integration, plugin, and contributor frontend |
| `.github` | Private | Organization configuration, community health files, templates, and reusable workflows |

Clone all six repositories under `D:\git\apiarylens`. Each newly activated
repository receives a small responsibility-specific scaffold, its own agent and
contributor guidance where appropriate, and links back to the authoritative master
architecture. Do not select an unapproved application framework merely to fill an
otherwise empty repository.

Future repositories such as private SaaS infrastructure, sensor firmware, Helm
charts, or community registries remain subject to the extraction criteria in ADR
0001 and are not created now.

## Consequences

- Discovery and design work begins with stable ownership boundaries.
- Public properties can establish Cloudflare deployment, accessibility, security,
  and content workflows before their full implementations exist.
- Cross-repository standards have an organization-level home immediately.
- The private operations repository can coordinate the portfolio without leaking
  private planning or credentials into public repositories.
- The project accepts modest early repository overhead in exchange for clearer
  ownership and fewer future migrations.

## Related Decisions

- [ADR 0001: Core Monorepo with Separate Properties and Operations](0001-project-structure.md)
- [ADR 0002: Domain Strategy](0002-domain-strategy.md)
- [ADR 0006: Cloudflare Hosting for Public Frontends](0006-cloudflare-public-frontends.md)
