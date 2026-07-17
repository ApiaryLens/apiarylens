# Contributing to ApiaryLens

Thanks for helping build ApiaryLens. The public monorepo contains the PWA, Node and
Cloudflare backends, shared contracts and database code, Docker Compose deployment,
tests, product release tooling, and authoritative documentation. Scout Bee is
developed independently in the public
[`ApiaryLens/scout-bee`](https://github.com/ApiaryLens/scout-bee) repository.

## Before you start

- Read [AGENTS.md](AGENTS.md) for the project's non-negotiable open-source,
  self-hosted, offline-capable, privacy, security, and licensing direction.
- Check the accepted [MVP definition](docs/product/mvp-definition.md), relevant ADRs,
  and open GitHub issues before proposing a durable architecture or scope change.
- Open an issue first for a substantial feature, compatibility change, new
  dependency, or new deployment component. Small fixes and documentation corrections
  can go directly to a focused pull request.
- Never include secrets, real hive/location records, credentials, private media, or
  maintainer-specific infrastructure.

## Development setup

Prerequisites are Node.js 24, Corepack, and pnpm 11. Cloudflare or Docker accounts
are not required for ordinary unit and build work. Scout Bee contributors should
use its separate repository and toolchain instructions.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm docs:check
pnpm security:secrets
```

Useful development commands:

```bash
pnpm dev         # Node API
pnpm dev:web     # React PWA
pnpm dev:worker  # Cloudflare Worker development target
pnpm test        # TypeScript test suites
pnpm build       # All buildable workspace projects
```

The complete `pnpm verify` gate includes formatting, linting, type checking,
TypeScript tests, production product builds, and backup/restore verification.
Container-image and vulnerability checks run in GitHub Actions. Scout Bee runs its
own UI, Go, packaging, signing, and release gates in its repository.

## Contribution expectations

- Keep pull requests scoped to one coherent change.
- Add or update tests for changed behavior, including negative authorization and
  organization-isolation cases where applicable.
- Update authoritative documentation and an ADR when a durable technical decision
  changes.
- Preserve equivalent release-scope behavior across Cloudflare and Compose.
- Keep the PWA useful without network access and preserve pending local work across
  compatible updates.
- Use approved assets from `assets/`; do not introduce a private build dependency.
- Run `pnpm verify`, `pnpm docs:check`, and `pnpm security:secrets` before submitting.
- Fill out the pull-request template and describe verification and remaining risk.

## Developer Certificate of Origin

ApiaryLens uses the
[Developer Certificate of Origin 1.1](https://developercertificate.org/) rather
than a separate Contributor License Agreement. Add a sign-off to every commit:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Git can add it automatically:

```bash
git commit -s
```

The sign-off certifies that you have the right to submit the contribution under the
project's [Apache License 2.0](LICENSE). Use your real name and an email address
associated with your Git identity.

## Bugs and security reports

Open regular bugs in the public issue tracker with a minimal reproduction and safe
diagnostics. Do not post vulnerabilities publicly; follow [SECURITY.md](SECURITY.md)
and use GitHub private vulnerability reporting.

All contributors must follow the [Code of Conduct](CODE_OF_CONDUCT.md).
