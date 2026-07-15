# ApiaryLens Product Graphics

This directory contains current, versioned visual exports used by ApiaryLens product
documentation. The written product documents remain authoritative if an export is
stale or ambiguous.

| Asset | Source | Status and purpose |
|---|---|---|
| `ApiaryLens_Capability_Map_2026-07.png` | Lucidchart document `36e00bfd-6fd9-46ed-ad8b-1032b1a34108` | Current public export for the Product Capability Overview |
| `ApiaryLens_Roadmap_2026-07.png` | Lucidchart document `755f46d8-c741-45f7-85e3-88f87a07aeca` | Current public export of the directional roadmap |
| `ApiaryLens_Marketing_Hero_2026-07.png` | OpenAI built-in image generation; prompt recorded below | Current pre-release marketing draft; requires normal human brand review before a formal campaign |
| `ApiaryLens_Marketing_Handout_Social_2026-07.png` | Deterministic HTML/CSS composition using the current marketing hero | Shareable 4:5 pre-release handout for social media, messaging, and email |
| `ApiaryLens_Web_Hero_Family_to_Professional_2026-07.png` | OpenAI built-in image generation; prompt recorded below | Purpose-built `.org` hero showing the family-to-professional ApiaryLens journey without embedded copy or UI |
| `architecture/components-network-trust.png` through `architecture/primary-user-journeys.png` | Lucidchart document `72787958-9344-4a71-af56-98a216b35aa1`, pages 1-7 | Current accessible exports for components/trust, authorization, media/backup, Scout Bee, CI/CD, recovery, and primary journeys |

## Family-to-Professional Web Hero Generation Record

- **Use:** Primary responsive `apiarylens.org` hero photography
- **Method:** AI-generated raster image using the built-in image-generation tool
- **Date:** 2026-07-15
- **Prompt summary:** An authentic family pair safely inspecting a Langstroth hive in
  the foreground of a larger well-managed apiary, with natural golden light and
  negative space for native web copy
- **Product alignment:** Family connection is primary; professional scale is a
  visible future journey. No feature, release, interface, or roadmap claims are
  embedded in the image.
- **Constraints:** No text, logos, application screens, private user data, unsafe
  beekeeping, or proprietary source imagery

## Marketing Hero Generation Record

- **Use:** Marketing Overview hero image
- **Method:** AI-generated raster image using the built-in image-generation tool
- **Date:** 2026-07-15
- **Prompt summary:** A candid, photorealistic adult beekeeper and older teenage son
  reviewing hive records on a rugged tablet beside a small family apiary, with
  correct protective clothing, realistic equipment, natural daylight, and no text,
  logos, application UI, or unsafe beekeeping behavior
- **Review intent:** Verify beekeeping accuracy, accessibility, image rights,
  disclosures, and final brand fit before external campaign publication

## Legacy Assets

The earlier brochure pages, capability cards, and roadmap image remain only in the
maintainer scratch directory `D:\git\apiarylens\assets`. They are not tracked,
referenced, or approved ApiaryLens assets.

## Shareable Handout

The editable source for the social handout is
[`sources/ApiaryLens_Marketing_Handout_Social_2026-07.html`](sources/ApiaryLens_Marketing_Handout_Social_2026-07.html).
Its text is rendered deterministically so product claims, spelling, and pre-release
status do not depend on text generated inside an image model.
