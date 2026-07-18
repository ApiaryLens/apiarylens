# docs/

Project documentation, handoff material, architecture notes, and Architecture
Decision Records (ADRs) for ApiaryLens.

Start with the Master Architecture and Design Plan in the ApiaryLens design
record (private; see [RELOCATED.md](RELOCATED.md)).
It is the authoritative assembled view of the current architecture, accepted
decisions, active direction, and unresolved work.

Any non-trivial technical decision -- tech stack choices, data model, offline sync
strategy, auth approach, deployment topology -- should be written up here before
it's implemented. Keeping decisions here (rather than only in PR descriptions or
chat history) is what lets the project's direction stay legible as it grows from a
single-hive hobby tool toward commercial-apiary scale.

## Key Folders

- `00-handoff/` -- imported project handoff, project context, transcript, manifest,
  and import summary.
- `adr/` -- initial ADRs and future decision records.
- `architecture/` -- feature inventory, repository strategy,
  version/release/update lifecycle, community gallery/registry
  considerations, media/AI notes, and related technical planning. The master
  architecture design plan moved to the private design record (see
  [RELOCATED.md](RELOCATED.md)).
- `brand/` -- public brand, graphics, asset, licensing, provenance, and publishing guidance.
- `deployment/` -- self-hosting and deployment strategy notes.
- `diagrams/` -- Lucidchart catalog and accessible public exports; legacy Mermaid
  sources await migration.
- `product/` -- accepted authoritative MVP definition and UAT contract, product
  brief, living capability overview, pre-release marketing overview, and longer
  marketing/product narrative docs.
- `research/` -- redirect only; research spikes moved to the private design
  record (see [RELOCATED.md](RELOCATED.md)).
- `operator/` -- redirect only; operator guides moved to the `apiarylens.org`
  repository (see [RELOCATED.md](RELOCATED.md)).
- `releases/` -- curated release notes, changelog, limitations, and support windows.
- `roadmap/` -- product roadmap and gated portfolio execution plan.
- `security/` -- canonical security architecture and risk register plus
  authentication, authorization, sharing, privacy, and secure-release design.
  The MVP threat model and ASVS verification map moved to the private design
  record (see [RELOCATED.md](RELOCATED.md)).
- `source-documents/` -- original imported Word, PDF, and Markdown source files.
- `strategy/` -- domain and project strategy notes.
- `testing/` -- deployment, PWA, device, offline, recovery, and cost test strategies.
- `user/` -- redirect only; user guides moved to the `apiarylens.org` repository
  (see [RELOCATED.md](RELOCATED.md)).

Use [Troubleshooting](troubleshooting.md) for symptom-based recovery and the
[MVP release gates](testing/mvp-release-gates.md) for the current evidence-backed
readiness status.

Start with `00-handoff/README_HOW_TO_USE_THIS_HANDOFF.md` if you are orienting a
new agent or session.
