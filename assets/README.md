# ApiaryLens Assets

This directory contains approved, versioned public assets used by ApiaryLens code,
documentation, and public properties.

The governing workflow is documented in
[`docs/brand/README.md`](../docs/brand/README.md).

Current product graphics live under [`graphics/`](graphics/). Structured diagrams
have editable Lucidchart sources recorded in the diagram catalog. Generated
marketing imagery records its prompt, method, review status, and intended use in the
graphics catalog. Legacy scratch graphics under `D:\git\apiarylens\assets` are not
repository assets and must not be published or referenced by product documentation.

Future organization may include:

```text
assets/
├── brand/          # logos, wordmarks, palettes, and official identity assets
├── icons/          # application, PWA, favicon, and interface icons
├── illustrations/  # approved public illustrations
├── graphics/       # marketing and documentation graphics
├── diagrams/       # public diagram exports where still referenced
└── provenance.json # safe asset origin, review, license, and integrity metadata
```

Do not commit credentials, private prompts, user data, tenant details, or private
studio configuration with an asset.
