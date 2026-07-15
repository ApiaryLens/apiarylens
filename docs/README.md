# docs/

Project documentation, handoff material, architecture notes, and Architecture
Decision Records (ADRs) for ApiaryLens.

Start with the
[Master Architecture and Design Plan](architecture/architecture-design-plan.md).
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
- `architecture/` -- architecture design plan, feature inventory, repository
  strategy, version/release/update lifecycle, community gallery/registry
  considerations, media/AI notes, and related technical planning.
- `brand/` -- public brand, graphics, asset, licensing, provenance, and publishing guidance.
- `deployment/` -- self-hosting and deployment strategy notes.
- `diagrams/` -- Lucidchart catalog and accessible public exports; legacy Mermaid
  sources await migration.
- `product/` -- accepted authoritative MVP definition and UAT contract, product
  brief, living capability overview, pre-release marketing overview, and longer
  marketing/product narrative docs.
- `research/` -- time-boxed architecture research and technical spikes.
- `operator/` -- direct and Scout-assisted operations, backup, restore, update,
  rollback, diagnostics, and uninstall guidance.
- `releases/` -- curated release notes, changelog, limitations, and support windows.
- `roadmap/` -- product roadmap and gated portfolio execution plan.
- `security/` -- canonical security architecture, the MVP threat model and
  [ASVS verification map](security/threat-model-and-asvs.md), and risk register plus
  authentication, authorization, sharing, privacy, and secure-release design.
- `source-documents/` -- original imported Word, PDF, and Markdown source files.
- `strategy/` -- domain and project strategy notes.
- `testing/` -- deployment, PWA, device, offline, recovery, and cost test strategies.
- `user/` -- installation, offline work, family access, records, media, and recovery
  guidance for beekeepers.

Use [Troubleshooting](troubleshooting.md) for symptom-based recovery and the
[MVP release gates](testing/mvp-release-gates.md) for the current evidence-backed
readiness status.

Start with `00-handoff/README_HOW_TO_USE_THIS_HANDOFF.md` if you are orienting a
new agent or session.
