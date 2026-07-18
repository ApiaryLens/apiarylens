# Relocated documents

Under ADR 0022 (documentation source-of-truth boundaries, accepted 2026-07-17),
product-wide design documents were moved out of this code repository. A change to
product code and a change to the product-wide design that authorizes it now require
commits to two different repositories.

Moved to the private `apiarylens-ops` repository, `design/` tree:

| Was here | Now |
|---|---|
| `docs/adr/0014` – `docs/adr/0021` (portfolio-wide ADRs) | `design/adr/` |
| `docs/deployment/windows-first-client-and-scout-bee.md` | `design/deployment/` |
| `docs/architecture/architecture-design-plan.md` (master architecture) | `design/architecture/` |
| `docs/security/windows-client-threat-model.md`, `docs/security/threat-model-and-asvs.md` | `design/security/` |
| `docs/research/` (all spikes) | `design/research/` |

Moved to the `apiarylens.org` repository:

| Was here | Now |
|---|---|
| `docs/user/` | `apiarylens.org/docs/user/` |
| `docs/operator/` | `apiarylens.org/docs/operator/` |

ADR 0022 itself lives at `apiarylens-ops/design/adr/0022-documentation-source-of-truth-boundaries.md`.
Repo-scoped ADRs (0001–0013) remain in `docs/adr/`. Full git history of every moved
file is preserved in this repository's log.
