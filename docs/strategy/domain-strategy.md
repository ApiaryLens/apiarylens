# Domain Strategy

ApiaryLens owns:

- `apiarylens.org`
- `apiarylens.com`
- `apiarylens.app`
- `apiarylens.dev`

The authoritative domain assignment is
[ADR 0002: Domain Strategy](../adr/0002-domain-strategy.md). The assembled product
and repository context is maintained in the
[Master Architecture and Design Plan](../architecture/architecture-design-plan.md).

| Domain | Durable purpose |
|---|---|
| `apiarylens.org` | Public project, marketing, documentation, tutorials, videos, downloads, releases, changelog, roadmap, community, and self-hosting |
| `apiarylens.app` | Public synthetic demo; possible future managed application or SaaS entry point |
| `apiarylens.dev` | Developer portal, APIs, integrations, SDKs, plugins, architecture, contributor resources, and development tooling |
| `apiarylens.com` | Reserved for future commercial or company use; redirects to `.org` for now |

These meanings are intended to remain stable as the project grows:

```text
.org = learn about it, deploy it, and participate
.app = use it
.dev = build with it
.com = reserved commercial flexibility
```

All official `.org`, `.app`, and `.dev` frontends and the current `.com` redirect
are hosted on Cloudflare under
[ADR 0006](../adr/0006-cloudflare-public-frontends.md). Cloudflare frontend hosting
does not require the portable ApiaryLens API, database, or self-hosted deployment to
use Cloudflare services.
