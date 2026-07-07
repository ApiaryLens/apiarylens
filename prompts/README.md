# prompts/

Reusable prompts for driving AI coding agents on recurring ApiaryLens tasks (for
example: "scaffold a new package under `packages/`," "write an ADR for a proposed
architecture change," "review a PR against `AGENTS.md`").

## Available Prompts

- `CODEX_RUN_ME_FIRST.md` -- Codex onboarding and handoff ingestion prompt.
- `CLAUDE_CODE_RUN_ME_FIRST.md` -- Claude Code onboarding and handoff ingestion
  prompt.
- `PROMPT_TO_CREATE_FOLLOWUP_TASKS.md` -- prompt for turning project context into
  follow-up tasks.

Add new prompts here once they are useful across more than one session. One-off
prompts do not need to live in the repo.
