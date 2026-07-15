# Community Galleries and Registries

## Status

Future architectural consideration. This document does not approve a specific
gallery, registry, marketplace, feature, or repository.

## Purpose

ApiaryLens may eventually let people publish, discover, install, import, or share
reusable assets. Designs made today should avoid preventing that ecosystem, while
the core product must remain useful without any central service or community
registry.

This document is the canonical reference for gallery and registry considerations.
Relevant design documents, research spikes, and ADRs should link here instead of
copying these requirements.

This requirement applies across the ApiaryLens organization, including the public
property repositories and the private `apiarylens-ops` repository. Their contributor
or agent instructions and relevant design templates must link back to this document.

## Possible Asset Types

- Inspection, task, and seasonal workflow templates
- Report and dashboard templates
- Regional bloom, forage, and plant datasets
- Equipment and hive-configuration profiles
- Sensor, weather, storage, and automation adapters
- Import/export mappings
- Optional plugins or extensions

This list identifies possibilities, not roadmap commitments.

## Architectural Requirements

Any future gallery or registry must preserve the project's core principles:

- **Optional:** ApiaryLens remains fully functional without the gallery or registry.
- **Self-hostable:** central discovery may be convenient, but it cannot be required
  for core operation. Local import/export and custom registry options should be
  considered.
- **Offline-capable:** installed assets needed in the field must remain available
  offline and have explicit synchronization behavior.
- **Privacy-first:** publishing is explicit opt-in. Private hive, location, health,
  and production data must never become a community asset implicitly.
- **Versioned:** assets need stable identifiers, schema versions, compatibility
  metadata, and migration or deprecation rules.
- **Traceable:** record origin, author, version, license, and integrity information.
- **Safe:** executable or behavior-changing assets require validation, permission
  boundaries, security review, and a revocation strategy.
- **Portable:** use documented formats that users can export, inspect, and move
  between self-hosted installations.
- **Moderated:** public contribution needs review, reporting, removal, and dispute
  processes appropriate to the asset's risk.

## Required Design Check

When a feature introduces reusable, shareable, installable, or community-maintained
assets, its research spike, design document, or ADR must state:

1. What is the asset and who owns it?
2. Is it local-only, privately shared, publicly published, or all three?
3. Does it require a gallery for presentation, a registry for machine discovery, or neither?
4. How is it identified, versioned, licensed, validated, and updated?
5. What works offline and without the central ApiaryLens service?
6. What data could be disclosed by publishing it?
7. Can third parties or self-hosters operate an alternate registry?
8. Does it justify an independent repository and governance model?

If the feature has no gallery or registry impact, the ADR may simply record that
conclusion and why.

## Gallery, Registry, and Marketplace Are Different

- A **gallery** presents assets for people to browse and preview.
- A **registry** provides structured discovery, versions, compatibility metadata,
  and distribution for software or machines.
- A **marketplace** introduces commercial transactions, publisher agreements,
  support obligations, and additional legal and operational requirements.

Do not call a gallery or registry a marketplace unless commercial transactions are
an intentional, separately approved decision.

## Repository Extraction Criteria

Keep early examples with the feature that owns them. Consider a dedicated public
repository when the asset collection develops one or more of these boundaries:

- Its own contribution, review, or moderation workflow
- A versioned catalog schema and compatibility lifecycle
- Independent validation, signing, or security automation
- Independent deployment or release cadence
- Significant binary or media storage
- Separate maintainers or governance

A new repository requires an ADR naming its scope, source of truth, trust model,
release process, and relationship to the core product.
