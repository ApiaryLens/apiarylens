# ApiaryLens Diagrams

Lucidchart is the authoritative diagram and flowchart system for ApiaryLens. See
[ADR 0004](../adr/0004-lucidchart-diagram-standard.md).

## Lucid Workspace

All editable diagrams live in the dedicated Lucid folder named `ApiaryLens`, created
on 2026-07-15. The connected Lucid MCP is used for document creation and retrieval;
the Lucid REST API is used for folder placement and deterministic PNG export when
the connector does not expose those operations. Credentials and the private folder
identifier are never stored in the public repository.

## Diagram Catalog

| Diagram | Lucid document | Repository export | Status |
|---|---|---|---|
| Product capability map | `36e00bfd-6fd9-46ed-ad8b-1032b1a34108` | `../../assets/graphics/ApiaryLens_Capability_Map_2026-07.png` | Current; source filed |
| Product roadmap | `755f46d8-c741-45f7-85e3-88f87a07aeca` | `../../assets/graphics/ApiaryLens_Roadmap_2026-07.png` | Current; source filed |
| MVP system context | `73bdf09b-fb53-4932-8c9e-e63b18d27b2a` | `../../assets/graphics/architecture/system-context.png` | Current |
| MVP deployment profiles | `8ee0123c-f6c3-4906-853c-ad893b2915fa` | `../../assets/graphics/architecture/deployment-profiles.png` | Current |
| MVP logical data model | `a22b915a-180b-47c9-b495-c68d3528cc99` | `../../assets/graphics/architecture/logical-data-model.png` | Current |
| Offline synchronization | `8e918109-d2e8-4392-a514-cc0f677daf11` | `../../assets/graphics/architecture/offline-synchronization.png` | Current |
| Authentication trust flow | `ae289dca-1262-4998-8422-8e73fe83fe13` | `../../assets/graphics/architecture/authentication-trust-flow.png` | Current |
| Safe update lifecycle | `684a4da4-37d9-4dd7-ae89-11bd97557b82` | `../../assets/graphics/architecture/safe-update-lifecycle.png` | Current |
| Repository and domain boundaries | `5abe71fa-b4ac-498f-84da-bf129ed08a20`, page 1 | `../../assets/graphics/architecture/repository-domain-boundaries.png` | Current |
| Research, ADR, and implementation flow | `5abe71fa-b4ac-498f-84da-bf129ed08a20`, page 2 | `../../assets/graphics/architecture/research-adr-implementation-flow.png` | Current |
| Components and network trust boundaries | `f22ae65e-c353-488e-ba54-51f7de4c189c`, page 1 | `../../assets/graphics/architecture/components-network-trust.png` | Current; source filed; visual review passed |
| Authorization boundaries | `97b127d3-5a52-4232-bf90-99e59966d987`, page 1 | `../../assets/graphics/architecture/authorization-boundaries.png` | Current; source filed; visual review passed |
| Media lifecycle, backup, and restore | `72787958-9344-4a71-af56-98a216b35aa1`, page 3 | `../../assets/graphics/architecture/media-backup-restore.png` | Current; source filed; visual review passed |
| Scout Bee executor | `72787958-9344-4a71-af56-98a216b35aa1`, page 4 | `../../assets/graphics/architecture/scout-bee-executor.png` | Current; source filed; visual review passed |
| CI/CD and release promotion | `72787958-9344-4a71-af56-98a216b35aa1`, page 5 | `../../assets/graphics/architecture/cicd-release-promotion.png` | Current; source filed; visual review passed |
| Update, rollback, and recovery | `f22ae65e-c353-488e-ba54-51f7de4c189c`, page 2 | `../../assets/graphics/architecture/update-rollback-recovery.png` | Current; source filed; visual review passed |
| Primary MVP user journeys | `72787958-9344-4a71-af56-98a216b35aa1`, page 7 | `../../assets/graphics/architecture/primary-user-journeys.png` | Current; source filed; visual review passed |
| Windows client portfolio and repository ownership | `f518f689-89dc-42d6-8200-bbb43467debe`, page 1 | `../../assets/graphics/architecture/windows-client-repository-ownership.png` | Current; source filed; visual review passed |
| Standalone Windows runtime and trust boundaries | `f518f689-89dc-42d6-8200-bbb43467debe`, page 2 | `../../assets/graphics/architecture/windows-standalone-trust-boundaries.png` | Current; source filed; visual review passed |
| Connected client deployment | `f518f689-89dc-42d6-8200-bbb43467debe`, page 3 | `../../assets/graphics/architecture/connected-client-deployment.png` | Current; source filed; visual review passed |
| Scout Windows target flows | `f518f689-89dc-42d6-8200-bbb43467debe`, page 4 | `../../assets/graphics/architecture/scout-windows-target-flows.png` | Current; source filed; visual review passed |
| Standalone-to-connected migration and rollback | `f518f689-89dc-42d6-8200-bbb43467debe`, page 5 | `../../assets/graphics/architecture/standalone-connected-migration-rollback.png` | Current; source filed; visual review passed |
| Independent Scout, client, and backend updates | `f518f689-89dc-42d6-8200-bbb43467debe`, page 6 | `../../assets/graphics/architecture/independent-update-state-machines.png` | Current; source filed; visual review passed |
| Backup, restore, and data locations | `f518f689-89dc-42d6-8200-bbb43467debe`, page 7 | `../../assets/graphics/architecture/backup-restore-data-locations.png` | Current; source filed; visual review passed |

Legacy Mermaid sources remain only as migration history and are not authoritative.
See [Operational Architecture and Journeys](operational-architecture.md) for
accessible descriptions of the seven-page operational diagram set.

## Final Visual Review

The 2026-07-15 final-polish review confirmed a clear left-to-right reading order,
consistent role colors, readable terminal states, and adequate export resolution on
all seven operational pages. It initially found connector-label collisions on the
components, authorization, and update/recovery pages. Those pages were rebuilt as
editable Lucid sources, filed in the dedicated `ApiaryLens` folder, exported through
the official Lucid API, and visually rechecked before their PNGs were promoted. The
four unchanged pages also passed. Rejected draft documents were labeled and moved out
of the authoritative folder so the catalog has no ambiguous final source.

The 2026-07-17 Windows and Scout review inspected all seven new pages at their
committed 1,600-pixel export width. The initial drafts exposed oversized automatic
text and connector-label collisions. They were rejected rather than promoted. The
final source uses fixed readable typography, explicit connector attachment points,
filled shapes above connectors, and adjacent accessible explanations in
[Windows Client and Scout Bee Architecture](windows-scout-architecture.md).

## Publishing Rules

- Use a descriptive title beginning with `ApiaryLens`.
- Record the Lucid URL or document ID, purpose, owner, and status in this catalog.
- Export an SVG or PNG when a chart is referenced by public Markdown.
- Commit the export and provide meaningful alt text and accompanying prose.
- Refresh the export whenever the Lucid source changes.
- Do not create new Mermaid or draw.io sources as authoritative diagrams.
