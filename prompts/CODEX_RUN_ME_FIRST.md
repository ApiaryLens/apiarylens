You are working in the ApiaryLens repository.

Repository local path:
D:\git\apiarylens\apiarylens

This repository is the main monorepo for ApiaryLens.

ApiaryLens is an open-source, self-hosted apiary intelligence and hive management platform for beekeepers. It is for new beekeepers, families, bee clubs, mentors, commercial beekeepers, extension offices, educators, researchers, and eventually sensor/AI integrations.

Read these files first:

1. AGENTS.md
2. docs/00-handoff/README_HOW_TO_USE_THIS_HANDOFF.md
3. docs/00-handoff/PROJECT_CONTEXT.md
4. docs/00-handoff/COMPLETE_VISIBLE_CHAT_TRANSCRIPT.md
5. docs/product/product-brief.md
6. docs/architecture/architecture-design-plan.md
7. docs/roadmap/roadmap.md
8. tasks/000-ingest-handoff.md

Your first job is NOT to build the app.

Your first job is to ingest, organize, and preserve this handoff material inside the repository.

Perform these actions:

1. Inspect the repository structure.
2. Preserve all handoff docs under docs/.
3. Ensure AGENTS.md exists and reflects ApiaryLens project rules.
4. Ensure README.md clearly explains ApiaryLens at a high level.
5. Ensure tasks/ contains a usable development backlog.
6. Ensure prompts/ contains reusable prompts for Codex/Claude.
7. Ensure docs/adr/ includes the initial ADRs.
8. Do not delete or overwrite useful existing repo files without backing them up or merging carefully.
9. Do not implement frontend/backend product code yet unless a task specifically instructs you to.
10. Create a clear summary of what was added and what should happen next.

Project principles:

- Open source first.
- Self-hosted first.
- Offline-first PWA.
- Privacy-first.
- No required paid cloud service for core operation.
- AI is optional and provider-pluggable.
- SaaS may happen later but must not be required for the open-source product.
- User data belongs to the user and must be exportable.
- The product must scale from 1 hive to 100+ hives.
- The UI must be usable outdoors on a phone in a bee yard.
- Do not rename ApiaryLens.

Suggested first commit message after ingesting this handoff:

docs: import ApiaryLens project handoff and foundation
