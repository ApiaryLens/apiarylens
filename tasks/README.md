# tasks/

Working task breakdowns for planned work on ApiaryLens.

When a piece of work is large enough to need scoping before it starts (e.g. "stand
up the first web client app," "design the offline sync protocol"), write the
breakdown here first. Both human contributors and AI agents should check this
folder before starting substantial work, to avoid duplicating scoping that's
already been done.

## Current Backlog

- `000-ingest-handoff.md` -- preserve and organize the imported handoff.
- `001-bootstrap-repository.md` -- complete repository hygiene and foundation setup.
- `002-create-adrs.md` -- review, normalize, and add initial decision records.
- `003-select-tech-stack.md` -- evaluate and decide the first implementation stack.
- `004-define-data-model.md` -- design the initial domain/data model.
- `005-plan-mvp.md` -- define the first usable MVP scope.
- `006-research-family-cloud-profile.md` -- select a measured, portable, near-free
  cloud reference for synchronized family use.
- `007-research-authentication-and-identity.md` -- select the built-in authentication,
  session, optional OIDC, and native-client authorization architecture.
- `008-bootstrap-repository-portfolio.md` -- create, clone, and establish the six
  accepted initial repositories.
- `009-establish-cloudflare-frontend-foundation.md` -- define and prove the shared
  Cloudflare Workers Static Assets convention for all public frontends.

Do not start app implementation until the relevant ADRs and task scope are reviewed.
