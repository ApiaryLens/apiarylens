# ApiaryLens Codex Handoff Guide

## Purpose of This ZIP

This ZIP moves the ApiaryLens planning conversation into files that Codex can read inside the local Git repository.

The target local folder is:

```text
D:\git\apiarylens
```

The existing repository is expected at:

```text
D:\git\apiarylens\apiarylens
```

## What Is Included

- Complete visible project chat transcript
- Product context
- Architecture and design plan
- Marketing/product overview whitepaper
- Feature inventory
- Domain strategy
- Repository strategy
- Roadmap
- Initial ADRs
- Codex and Claude prompts
- AGENTS.md instructions
- Task backlog
- Previous generated OpenHive draft docs
- Updated ApiaryLens docs in Markdown, DOCX, and PDF
- Diagrams and graphics
- PowerShell script to copy the repo overlay into the existing repo

## How to Use

1. Download the ZIP.
2. Extract it to:

```text
D:\git\apiarylens
```

3. Open PowerShell in the extracted folder.
4. Run:

```powershell
.\INSTALL_INTO_EXISTING_REPO.ps1
```

5. Change into the repo:

```powershell
cd D:\git\apiarylens\apiarylens
```

6. Start Codex:

```powershell
codex
```

7. Paste the prompt from:

```text
prompts/CODEX_RUN_ME_FIRST.md
```

## Important

Codex should not build the app immediately.

The first Codex task is to ingest and organize this handoff into the repo, preserve the context, and prepare a clean first commit.
