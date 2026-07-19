/**
 * Owner-directed About page (T2 addition, 2026-07-18): release information,
 * documentation, and how-tos in one discoverable place. The page itself must
 * render fully offline; only the external links need a connection, and they
 * are gated honestly rather than left as broken clicks.
 */

/**
 * The public preview name announcements lead with. The wire version stays the
 * semver build ordinal; this label is pinned by hand exactly like the service
 * worker cache version, and about-data.test.ts fails the suite whenever it
 * drifts from the docs/releases/changelog.md entry for the current build.
 */
export const publicPreviewName = 'Preview 1';

export interface ExternalLink {
  label: string;
  href: string;
  /** Short honest description shown under the link. */
  detail: string;
}

/** Release surfaces for the running build. External — require a connection. */
export function releaseLinks(productVersion: string): ExternalLink[] {
  return [
    {
      label: 'Release notes and verification',
      href: `https://apiarylens.org/releases/${productVersion}/`,
      detail: `What shipped in build ${productVersion}, with checksums and verification steps`,
    },
    {
      label: 'GitHub release and artifacts',
      href: `https://github.com/ApiaryLens/apiarylens/releases/tag/v${productVersion}`,
      detail: 'Downloadable bundles, SBOM, license report, and provenance evidence',
    },
  ];
}

/** Documentation surfaces. External — require a connection. */
export const documentationLinks: ExternalLink[] = [
  {
    label: 'Documentation home',
    href: 'https://apiarylens.org/docs/',
    detail: 'User, operator, and developer documentation',
  },
  {
    label: 'User guide and how-tos',
    href: 'https://apiarylens.org/docs/user/',
    detail: 'Step-by-step guides for everyday hive record keeping',
  },
  {
    label: 'Scout Bee operator guide',
    href: 'https://apiarylens.org/docs/user/scout-bee-guide/',
    detail: 'Install, update, backup, and restore for self-hosted servers',
  },
];
