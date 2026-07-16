# ApiaryLens Brand and Asset System

## Status

The MVP brand system is implemented and approved for the current Public Preview
properties. The public source of truth includes the logo mark, browser/PWA icon
sizes, family-to-professional hero, product graphics, Lucidchart exports, usage
guidance, and safe provenance records under [`assets/`](../../assets/). New campaign
uses and trademark changes still require normal human review.

## Public Source of Truth

Approved ApiaryLens brand assets, usage guidance, licensing, accessibility notes,
and safe provenance belong in the public ApiaryLens repositories. A user,
contributor, packager, or fork must be able to build and understand the product
without access to a maintainer's private creative environment.

The initial shared asset location is [`assets/`](../../assets/). Public properties
such as `apiarylens.org`, `apiarylens.app`, and `apiarylens.dev` should consume
versioned approved assets rather than maintaining visually divergent copies.

## Studio Foundry

The maintainer may use
[`Hybrid-Solutions-Cloud/studio-foundry`](https://github.com/Hybrid-Solutions-Cloud/studio-foundry)
as an optional production studio for official graphics, illustrations, image
variants, and other approved pre-rendered media.

Studio Foundry is currently a private, environment-specific system in the process of
being generalized. It is not part of ApiaryLens, is not required to build or run the
product, and is not the public source of truth for approved assets.

Useful workflow patterns identified in Studio Foundry include:

- Research and design before generation
- Human review and selection of candidates
- Content-safety and responsible-AI checks
- Budget and metered-call gates
- Pre-rendering rather than runtime generation
- Immutable or content-hashed outputs where useful
- Provenance records for generated assets
- Gated publishing into the repository that owns the final asset

## Asset Workflow

1. Create a public creative brief defining purpose, audience, format, accessibility,
   and brand constraints.
2. Produce candidates manually or through an optional maintainer studio.
3. Review for quality, accuracy, safety, licensing, trademarks, accessibility, and
   suitability for beekeepers.
4. Select and optimize approved outputs.
5. Commit approved assets and safe provenance to the repository that owns them.
6. Publish the consuming application or website from committed, versioned assets.

No application build or runtime request should call Studio Foundry to obtain required
branding. If the studio is unavailable, previously approved assets remain buildable
and usable.

## Provenance

Generated or materially AI-assisted assets should record, where safe and relevant:

- Repository-relative asset path
- Asset purpose and owner
- Creation method: human, AI-assisted, generated, licensed stock, or contributed
- Generator or tool family and version
- Creation timestamp
- Source or input asset reference
- Prompt or creative-brief hash rather than sensitive prompt text
- Human reviewer and approval status
- License and attribution requirements
- Dimensions, format, and content hash

Do not publish credentials, endpoints, tenant information, private prompt libraries,
internal paths, or other maintainer infrastructure details as provenance.

## Branding and Trademark Safety

- Logo, wordmark, and trademark-defining assets require human design ownership and
  review. Generative tools may assist exploration but should not be the only basis
  for a trademark-critical final mark.
- Review generated imagery for protected marks, copied styles, inaccurate
  beekeeping practices, unsafe handling, misleading disease or treatment depictions,
  and unintended personal information.
- Record required AI-generation disclosure when policy, license, or context calls for it.
- Do not use real user hive photos, locations, records, or media in an external
  generation service without separate explicit consent and a feature-specific ADR.

## Accessibility and Formats

- Provide meaningful alt text or equivalent descriptive context for informative images.
- Do not encode required instructions only inside an image.
- Prefer SVG for logos and icons when appropriate, with optimized PNG/WebP variants
  for contexts that require raster formats.
- Provide light, dark, high-contrast, monochrome, and small-icon treatments where the
  design requires them.
- Test marks and icons outdoors, on phones, in glare, and at small PWA-icon sizes.

## Repository Extraction

Keep shared assets in the core repository initially. Consider a dedicated public
brand or asset repository only when the collection develops an independent release
cadence, contribution workflow, licensing boundary, or cross-repository automation
that justifies extraction through an ADR.
