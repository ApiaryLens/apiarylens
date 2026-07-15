# Task 001: Bootstrap the Core Repository Structure

## Status

Foundation structure established. Application and package subdirectories remain
deferred until their prerequisite research and ADRs are accepted.

Repository-portfolio creation is tracked separately by
[Task 008](008-bootstrap-repository-portfolio.md).

## Goal

Maintain the framework-neutral core monorepo foundation required for architecture,
research, implementation, self-hosted deployment, and reusable automation.

## Current Foundation

```text
.github/
apps/
packages/
assets/
docs/
tasks/
prompts/
docker/
scripts/
```

Use explanatory README files for intentionally empty areas. Create `apps/web`,
`apps/api`, `apps/worker`, `apps/mobile`, and shared package directories only after
the responsible ADR defines their runtime, ownership, and dependency boundaries.

## Do Not

- Do not build an application merely to complete the folder tree.
- Do not select frameworks through scaffold generators before an ADR.
- Do not introduce required paid or proprietary services.
- Do not make SaaS, Cloudflare backend services, or AI required.
- Do not duplicate content owned by the public-property repositories.
