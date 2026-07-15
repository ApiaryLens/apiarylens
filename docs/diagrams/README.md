# ApiaryLens Diagrams

Lucidchart is the authoritative diagram and flowchart system for ApiaryLens. See
[ADR 0004](../adr/0004-lucidchart-diagram-standard.md).

## Lucid Workspace

All editable diagrams must live in a dedicated Lucid folder named `ApiaryLens`.
The connected Lucid MCP supports document search, creation, retrieval, sharing, and
export, but currently exposes no folder-management operation. The folder must be
created or shared through Lucid before authoritative diagrams are generated into
their final location.

No existing Lucid document named ApiaryLens was found during the 2026-07-15 search.

## Diagram Catalog

| Diagram | Lucid document | Repository export | Status |
|---|---|---|---|
| System context | Pending migration | `system-context.mmd` legacy source | Awaiting Lucid folder |
| Deployment tiers and user journey | Pending | Pending | Awaiting Lucid folder |
| Repository and domain boundaries | Pending | Pending | Awaiting Lucid folder |
| Cloudflare public frontends and portable backend boundary | Pending | Pending | Awaiting Lucid folder |
| Research, ADR, and implementation flow | Pending | Pending | Awaiting Lucid folder |
| Initial domain data model | Pending migration | `data-model.mmd` legacy source | Awaiting data-model design and Lucid folder |
| Roadmap | Pending migration | `roadmap.mmd` legacy source | Awaiting Lucid folder |

## Publishing Rules

- Use a descriptive title beginning with `ApiaryLens`.
- Record the Lucid URL or document ID, purpose, owner, and status in this catalog.
- Export an SVG or PNG when a chart is referenced by public Markdown.
- Commit the export and provide meaningful alt text and accompanying prose.
- Refresh the export whenever the Lucid source changes.
- Do not create new Mermaid or draw.io sources as authoritative diagrams.
