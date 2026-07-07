# Contributing to ApiaryLens

Thanks for your interest in ApiaryLens. The project is in its earliest scaffold
stage — there is no application code yet, so most contributions right now will be
about **direction**, not feature code.

## Current stage

This repo currently contains only foundation files and folder structure. Before
opening a PR with code, check [`docs/`](docs/) and [`tasks/`](tasks/) for whether the
relevant app or package has actually been scaffolded — if it hasn't, start a
discussion or issue instead of a PR.

## How to contribute right now

- **Discuss direction.** Open an issue if you have thoughts on the project's
  direction (see README.md's Principles and Project direction sections), the data
  model, sync strategy, or tech stack.
- **Propose an ADR.** Non-trivial technical decisions belong in `docs/` as an
  Architecture Decision Record before implementation begins.
- **File issues for gaps.** If something in the scaffold is missing or inconsistent,
  open an issue.

## Ground rules

- Read [AGENTS.md](AGENTS.md) — it documents the project's non-negotiable direction
  (open source, self-hosted first, offline-first, privacy-first, AI-assisted not
  AI-required). Contributions that conflict with these will be asked to change
  direction, human or AI-authored alike.
- Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- No license has been finalized yet (see [LICENSE](LICENSE)). By contributing, you
  agree your contribution can be released under whatever open-source license the
  project ultimately adopts.

## Pull requests

Once application code exists:

1. Open an issue first for anything beyond a small fix, so direction can be agreed
   before work starts.
2. Keep PRs scoped to one change.
3. Fill out the PR template.
4. Expect CI, style, and test requirements to be documented here once they exist —
   they don't yet.

## Reporting bugs vs. reporting vulnerabilities

Regular bugs: open a GitHub issue using the bug report template.

Security vulnerabilities: **do not** open a public issue — see
[SECURITY.md](SECURITY.md).
