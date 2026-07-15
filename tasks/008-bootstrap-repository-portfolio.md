# Task 008: Bootstrap the Repository Portfolio

## Status

Completed on 2026-07-15. All repositories were created with the accepted visibility,
cloned to their canonical paths, scaffolded without choosing application frameworks,
and published to `main`.

| Repository | Initial commit |
|---|---|
| `apiarylens-ops` | `a1acdb7` |
| `apiarylens.org` | `0dd4bc2` |
| `apiarylens.app` | `7e862b8` |
| `apiarylens.dev` | `bfee1f1` |
| `.github` | `24e396d` |

## Goal

Create, clone, and establish the responsibility-specific foundation for every
repository accepted in ADR 0005.

## Repository Set

| Repository | Visibility | Local path |
|---|---|---|
| `ApiaryLens/apiarylens` | Public | `D:\git\apiarylens\apiarylens` |
| `ApiaryLens/apiarylens-ops` | Private | `D:\git\apiarylens\apiarylens-ops` |
| `ApiaryLens/apiarylens.org` | Public | `D:\git\apiarylens\apiarylens.org` |
| `ApiaryLens/apiarylens.app` | Public initially | `D:\git\apiarylens\apiarylens.app` |
| `ApiaryLens/apiarylens.dev` | Public | `D:\git\apiarylens\apiarylens.dev` |
| `ApiaryLens/.github` | Public | `D:\git\apiarylens\.github` |

## Required Work

- Inventory existing GitHub repositories and local directories before creating anything.
- Create only missing repositories with the accepted visibility.
- Clone each repository into its canonical local path.
- Add a responsibility-specific README and AGENTS file.
- Add appropriate contribution, security, license-status, code-owner, issue/PR,
  dependency, and automation foundations without copying irrelevant files blindly.
- Link every repository to the core master architecture, repository strategy,
  Cloudflare frontend ADR where relevant, and gallery/registry requirements.
- Add minimal directory structures that reflect approved ownership without choosing
  an unapproved application framework.
- Keep credentials, account identifiers, private infrastructure values, and secrets
  out of every repository.
- Commit and push each new repository's reviewed initial scaffold.

## Suggested Initial Structures

### `apiarylens-ops` (private)

```text
docs/
planning/
runbooks/
dashboards/
scripts/
tasks/
```

### Public frontend repositories

```text
docs/
public/
scripts/
src/          # placeholder only until framework ADR, if needed
```

### `.github`

```text
profile/
ISSUE_TEMPLATE/
workflow-templates/
```

## Acceptance Criteria

- The GitHub and local repository sets match ADR 0005 exactly.
- Repository visibility is correct.
- Each repository clearly states what it owns and what it must not duplicate.
- No scaffold selects a framework or service beyond accepted decisions.
- Public frontend repositories name Cloudflare Workers Static Assets as their target
  without adding deployment credentials.
- Baseline link, secret, and repository checks pass.
