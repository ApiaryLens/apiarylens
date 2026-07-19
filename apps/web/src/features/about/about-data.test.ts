import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentationLinks, publicPreviewName, releaseLinks } from './about-data.js';

describe('About page data', () => {
  it('pins the public preview name to the released changelog entry', () => {
    // The public name is pinned by hand (like the service-worker cache
    // version); this guard fails the suite when a release renames the public
    // preview without updating the About page.
    const { version } = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const changelog = readFileSync(
      new URL('../../../../../docs/releases/changelog.md', import.meta.url),
      'utf8',
    );
    expect(changelog).toContain(`## ${version} — ${publicPreviewName}`);
  });

  it('builds release links for the running build version', () => {
    const links = releaseLinks('0.1.0-preview.6');
    expect(links.map((link) => link.href)).toEqual([
      'https://apiarylens.org/releases/0.1.0-preview.6/',
      'https://github.com/ApiaryLens/apiarylens/releases/tag/v0.1.0-preview.6',
    ]);
    for (const link of links) {
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.detail.length).toBeGreaterThan(0);
    }
  });

  it('points documentation at apiarylens.org and describes each destination', () => {
    expect(documentationLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of documentationLinks) {
      expect(link.href).toMatch(/^https:\/\/apiarylens\.org\/docs\//);
      expect(link.detail.length).toBeGreaterThan(0);
    }
  });

  it('keeps the page itself offline-capable: external links are gated, never broken', () => {
    const aboutSource = readFileSync(new URL('./AboutPage.tsx', import.meta.url), 'utf8');
    // Offline: disabled text instead of an anchor, plus an honest explanation.
    expect(aboutSource).toContain('offline ? (');
    expect(aboutSource).toContain('aria-disabled="true"');
    expect(aboutSource).toContain('OFFLINE — LINKS DISABLED');
    // The always-offline reference is the in-app glossary (FB-010).
    expect(aboutSource).toContain('Open the beekeeping glossary');
    expect(aboutSource).toContain('glossary.open()');
  });
});
