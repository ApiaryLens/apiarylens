# Handoff Import Summary

Imported on 2026-07-07 into the ApiaryLens monorepo.

## Source

Transfer folder:

```text
D:\tmp\ApiaryLens_Codex_Transfer\ApiaryLens_Codex_Transfer
```

Primary instruction file:

```text
CODEX_RUN_ME_FIRST.md
```

## What Was Imported

- Handoff guide, manifest, project context, and visible chat transcript under `docs/00-handoff/`.
- Product brief and marketing whitepaper under `docs/product/`.
- Architecture plan, feature inventory, repository strategy, media/AI notes, and weather/bloom notes under `docs/architecture/`.
- Initial proposed ADRs under `docs/adr/`.
- Roadmap, deployment, security/sharing, strategy, and diagram docs under `docs/`.
- Source Word/PDF/Markdown documents under `docs/source-documents/`.
- Archived previous OpenHive drafts under `docs/source-documents/previous-openhive-drafts/`.
- Initial task backlog under `tasks/`.
- Reusable Codex/Claude prompts under `prompts/`.
- Diagram and graphics assets under `assets/`.
- `.gitkeep` placeholders for planned app/package/deployment/tooling folders.

## Files Intentionally Preserved

The import did not overwrite existing stronger repository foundation files:

- `AGENTS.md`
- `README.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `LICENSE`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

## Follow-Up Notes

- `docs/adr/0002-domain-strategy.md` was normalized into ADR format during import.
- Existing `docs/README.md`, `tasks/README.md`, and `prompts/README.md` still contain pre-import wording because Windows ACLs denied edits to those existing files from this session. Their contents should be updated once file permissions are corrected.
- No frontend, backend, database, or deployment application code was added.