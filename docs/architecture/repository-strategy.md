# Repository Strategy

## Current Local Layout

GitHub organization folder:

```text
D:\git\apiarylens
```

Repository portfolio:

```text
D:\git\apiarylens\apiarylens
D:\git\apiarylens\scout-bee
D:\git\apiarylens\apiarylens-ops
D:\git\apiarylens\apiarylens.org
D:\git\apiarylens\apiarylens.app
D:\git\apiarylens\apiarylens.dev
D:\git\apiarylens\.github
```

## Strategy

Use a public core-product monorepo with private repositories for independently
deployed public properties and internal operations. A public website does not
require its deployment source repository to be public. Repository boundaries
follow ownership, visibility, deployment, release cadence, and contribution model;
they do not exist solely because a domain name exists.

| Repository | Visibility | Responsibility | Activation point |
|---|---|---|---|
| `apiarylens` | Public | Product clients/backends, shared contracts, migrations, Compose/templates, immutable product artifacts, architecture, and ADRs; build/publish only, never personal-environment deployment | Active |
| [`scout-bee`](https://github.com/ApiaryLens/scout-bee) | Public | Independently versioned lifecycle application for install, update, repair, diagnostics, backup, restore, rollback, uninstall, deployment orchestration, and plan/CI export | Active; staged cutover under ADR 0014 |
| `apiarylens-ops` | Private | Internal planning, dashboards, coordination, and operations | Active |
| `apiarylens.org` | Private | Marketing, public docs experience, tutorials, releases, roadmap, and community | Active and deployed |
| `apiarylens.app` | Private | Demo deployment, safe seed data, and hosted-app configuration | Active and deployed |
| `apiarylens.dev` | Private | Developer portal, API reference, integrations, SDKs, plugins, and contributor docs | Active and deployed |
| `.github` | Private | Internal organization configuration, reference templates, and private-repository workflow sources | Active |

Each activated repository has responsibility-specific guidance, governance,
independent build/deployment configuration, and a clear source-of-truth boundary.
The original bootstrap decision is recorded in
[ADR 0005](../adr/0005-initial-repository-portfolio.md); current implementation and
deployment status is recorded in the master architecture and MVP evidence.

## Source-of-Truth Boundaries

### `apiarylens`

The main repository is authoritative for product behavior, technical architecture,
ADRs, source OpenAPI contracts, database migrations, portable deployment templates,
and versioned immutable product releases. Its workflows build, test, attest, and
publish; they never deploy a maintainer's or user's environment. It initially owns
shared approved brand assets and their public provenance and licensing guidance.

### `scout-bee`

ADR 0014 established the separate Apache-2.0 public
[`ApiaryLens/scout-bee`](https://github.com/ApiaryLens/scout-bee) repository and
independent release identity for Scout Bee. Scout consumes exact core product releases and owns
orchestration, lifecycle operations, target execution, verified release caching,
self-update, recovery, diagnostics, and secret-free plan/lock/CI export. It does not
copy the product source, own the database/API contracts, or make a personal
deployment workflow part of the core repository. The embedded monorepo implementation
was removed after the separate working repository and its independent validation and
release workflows were staged. Exact released-byte replacement verification remains
a release gate rather than a reason to keep duplicate production source.

### `apiarylens-ops`

The private operations repository is authoritative for internal project management,
private dashboards, cross-repository coordination, internal procedures, and future
commercial planning. Store secrets in an appropriate secret manager, not in Git.

Do not allow this repository to become an unstructured home for future production
SaaS infrastructure. Create a dedicated private infrastructure repository when that
boundary becomes operationally meaningful.

### `apiarylens.org`

The public project website owns marketing and editorial presentation. It may publish
or render user and operator documentation whose technical source remains in
`apiarylens`; content must not be maintained as divergent copies. It consumes
approved versioned brand assets rather than becoming a second identity source.
Its official frontend deploys through Cloudflare under
[ADR 0006](../adr/0006-cloudflare-public-frontends.md).

### `apiarylens.app`

The hosted-property repository deploys a versioned ApiaryLens release with
environment-safe configuration and demo content. It does not fork or duplicate the
application engine. A future SaaS service may use the domain, while sensitive
production infrastructure can remain in a separate private repository.
The public synthetic demo frontend deploys through Cloudflare, but the API and data
services remain portable and may run outside Cloudflare.

### `apiarylens.dev`

The developer property renders generated API material and owns developer-focused
guides, integrations, SDK documentation, plugin documentation, contributor content,
and sandbox information. Product contracts remain authoritative in `apiarylens`.
Its official frontend deploys through Cloudflare.

### `.github`

The private organization configuration repository owns internal configuration,
reference templates, and reusable workflow sources intended for compatible private
repositories. GitHub does not apply default community-health files from a private
`.github` repository, so the public `apiarylens` repository carries its own public
contribution guidance and issue templates. A public organization profile is not
published from this private repository; if one is wanted later, expose only
intentionally reviewed profile material. Product-specific workflows remain with
the repository that executes them.

## Future Galleries and Registries

ApiaryLens may eventually support community-contributed reusable assets such as:

- Inspection and workflow templates
- Report and dashboard templates
- Regional bloom and forage datasets
- Equipment profiles
- Sensor and weather-provider adapters
- Integrations and plugins

These are architectural possibilities, not approved repositories or committed
features. Consult
[`community-galleries-and-registries.md`](community-galleries-and-registries.md)
whenever a design introduces reusable or community-published assets.

When new ApiaryLens repositories are activated, their contributor or agent
instructions and design templates must reference that canonical document so the
requirement follows work performed outside the core monorepo.

Create a dedicated gallery or registry repository only when at least one strong
boundary exists:

- Independent public contribution and review workflow
- Versioned catalog schema or compatibility lifecycle
- Automated validation, signing, moderation, or security review
- Independent deployment or release cadence
- Large assets that should not burden the product repository
- Different maintainers or governance

Until then, examples and experiments remain in the repository that owns the feature.

## Other Possible Future Repositories

- `apiarylens-cloud` or `apiarylens-infrastructure` for private hosted-service infrastructure
- `apiarylens-sensor-firmware` when hardware has its own toolchain and release lifecycle
- `apiarylens-helm-charts` when Kubernetes becomes a supported deployment target
- A gallery or registry repository whose name reflects the assets it actually governs

Do not create these until their extraction criteria are met.
