# ADR 0001: Start with Main Monorepo

## Status

Proposed

## Context

ApiaryLens is early stage. The project needs documentation, backend, frontend, database schema, API contracts, prompts, tasks, and deployment artifacts to stay aligned.

## Decision

Start with one main monorepo:

```text
ApiaryLens/apiarylens
```

## Consequences

Benefits:

- Easier for Codex/Claude to understand full context.
- Easier to keep docs and code aligned.
- Easier shared types and API contracts.
- Less operational overhead.

Tradeoffs:

- Repo can grow large.
- CI must be designed carefully.
- Future repos may be split out when needed.
