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
| Components and network trust boundaries | `72787958-9344-4a71-af56-98a216b35aa1`, page 1 | `../../assets/graphics/architecture/components-network-trust.png` | Current |
| Authorization boundaries | `72787958-9344-4a71-af56-98a216b35aa1`, page 2 | `../../assets/graphics/architecture/authorization-boundaries.png` | Current |
| Media lifecycle, backup, and restore | `72787958-9344-4a71-af56-98a216b35aa1`, page 3 | `../../assets/graphics/architecture/media-backup-restore.png` | Current |
| Scout Bee executor | `72787958-9344-4a71-af56-98a216b35aa1`, page 4 | `../../assets/graphics/architecture/scout-bee-executor.png` | Current |
| CI/CD and release promotion | `72787958-9344-4a71-af56-98a216b35aa1`, page 5 | `../../assets/graphics/architecture/cicd-release-promotion.png` | Current |
| Update, rollback, and recovery | `72787958-9344-4a71-af56-98a216b35aa1`, page 6 | `../../assets/graphics/architecture/update-rollback-recovery.png` | Current |
| Primary MVP user journeys | `72787958-9344-4a71-af56-98a216b35aa1`, page 7 | `../../assets/graphics/architecture/primary-user-journeys.png` | Current |

Legacy Mermaid sources remain only as migration history and are not authoritative.
See [Operational Architecture and Journeys](operational-architecture.md) for
accessible descriptions of the seven-page operational diagram set.

## Publishing Rules

- Use a descriptive title beginning with `ApiaryLens`.
- Record the Lucid URL or document ID, purpose, owner, and status in this catalog.
- Export an SVG or PNG when a chart is referenced by public Markdown.
- Commit the export and provide meaningful alt text and accompanying prose.
- Refresh the export whenever the Lucid source changes.
- Do not create new Mermaid or draw.io sources as authoritative diagrams.
