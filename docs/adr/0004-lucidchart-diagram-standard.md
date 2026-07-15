# ADR 0004: Lucidchart Diagram Standard

## Status

Accepted

## Context

ApiaryLens needs consistent, editable architecture diagrams and flowcharts across
the open-source product, public properties, private operations, and future hosted
environments. The diagrams must be centrally organized without requiring an
open-source contributor to have a Lucid account merely to understand the design.

## Decision

- Author all new or substantially revised architecture diagrams, data diagrams,
  and flowcharts in Lucidchart.
- Store the editable Lucid documents in a dedicated `ApiaryLens` folder in Lucid.
- Use the connected Lucid MCP for search, creation, retrieval, and export whenever
  its exposed capabilities support the operation.
- Track every authoritative chart in [`docs/diagrams/README.md`](../diagrams/README.md)
  with its Lucid URL or document ID, purpose, owner, status, and exported artifact.
- Commit an accessible SVG or PNG export for public documentation when a diagram is
  referenced by the open-source repository.
- Accompany diagrams with enough Markdown narrative and alt text that the design is
  understandable without Lucid access.
- Treat existing Mermaid or other diagram sources as legacy migration inputs; do
  not expand them as the authoritative diagram system.

## Consequences

- Lucidchart is the editable diagram source of truth for ApiaryLens.
- Open exports and Markdown explanations prevent Lucid from becoming a runtime or
  contributor-access dependency for the open-source product.
- Diagram updates require refreshing the corresponding repository export.
- The dedicated Lucid folder was created on 2026-07-15. Authoritative source
  documents and portable exports are cataloged in
  [`docs/diagrams/README.md`](../diagrams/README.md).
