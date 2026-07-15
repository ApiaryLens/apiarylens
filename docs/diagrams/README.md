# ApiaryLens Diagrams

Lucidchart is the authoritative diagram and flowchart system for ApiaryLens. See
[ADR 0004](../adr/0004-lucidchart-diagram-standard.md).

## Lucid Workspace

All editable diagrams must live in a dedicated Lucid folder named `ApiaryLens`.
The connected Lucid MCP supports document search, creation, retrieval, sharing, and
export, but currently exposes no folder-management operation. No existing Lucid
document or folder named ApiaryLens was found during the 2026-07-15 search. New
documents are temporarily created at the connected workspace root and must be moved
into the required `ApiaryLens` folder through Lucid when that folder is available.

## Diagram Catalog

| Diagram | Lucid document | Repository export | Status |
|---|---|---|---|
| Product capability map | `36e00bfd-6fd9-46ed-ad8b-1032b1a34108` | `../../assets/graphics/ApiaryLens_Capability_Map_2026-07.png` | Current; move Lucid source into `ApiaryLens` folder |
| System context | Pending migration | `system-context.mmd` legacy source | Awaiting Lucid folder |
| Deployment tiers and user journey | Pending | Pending | Awaiting Lucid folder |
| Repository and domain boundaries | Pending | Pending | Awaiting Lucid folder |
| Cloudflare public frontends and portable backend boundary | Pending | Pending | Awaiting Lucid folder |
| Research, ADR, and implementation flow | Pending | Pending | Awaiting Lucid folder |
| Initial domain data model | Pending migration | `data-model.mmd` legacy source | Awaiting data-model design and Lucid folder |
| Product roadmap | `755f46d8-c741-45f7-85e3-88f87a07aeca` | `../../assets/graphics/ApiaryLens_Roadmap_2026-07.png` | Current; move Lucid source into `ApiaryLens` folder |

## Publishing Rules

- Use a descriptive title beginning with `ApiaryLens`.
- Record the Lucid URL or document ID, purpose, owner, and status in this catalog.
- Export an SVG or PNG when a chart is referenced by public Markdown.
- Commit the export and provide meaningful alt text and accompanying prose.
- Refresh the export whenever the Lucid source changes.
- Do not create new Mermaid or draw.io sources as authoritative diagrams.
