# apiarylens — Claude Code

@AGENTS.md

<!--
  This file is a thin shim. All cross-tool repo instructions live in AGENTS.md,
  imported above via Claude Code's @path syntax (inlined at session launch).
  Keep only genuinely Claude-Code-specific notes below.
-->

## Claude Code notes

- Subagents, skills, and hooks for this repo live in `.claude/`. The repo-level MCP config is `.mcp.json`.
- Use **plan mode** before broad, repo-wide changes.
- Follow the `.ai/` session protocol: read `.ai/state/*` at session start, and update `.ai/state/HANDOFF.md` before ending a session.
- `AGENTS.md` is the public, repository-local source of truth. Do not require access
  to a maintainer's private platform, identity, vault, or documentation to work on
  the open-source product.


## Claude Code actions in this repo

**Run autonomously:**
- Read, search, and grep any file in this repo
- Write and edit files in this repo
- `git add`, `git commit`, `git push`
- `gh issue`, `gh pr`, `gh run` CLI commands
- `npm install`, `npm run build`, `npm test`

**Always confirm before:**
- Creating or deleting Azure resources
- Any `az` CLI write operation that modifies Azure state
- Running destructive operations
- Making API calls to external services
- Installing software
