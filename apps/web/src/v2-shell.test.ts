import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const overviewSource = readFileSync(
  new URL('./features/overview/OverviewPage.tsx', import.meta.url),
  'utf8',
);

/**
 * Guardrails for the owner-selected V2 "Clean Dashboard" shell (T2 gate,
 * 2026-07-18): sidebar navigation groups, both color themes, dense-table
 * ergonomics, and the modular dashboard composition the owner will iterate on.
 */
describe('V2 clean-dashboard shell', () => {
  it('groups the sidebar into Workspace, Reference, and Administration', () => {
    expect(appSource).toContain('Workspace');
    expect(appSource).toContain('Reference');
    expect(appSource).toContain('Administration');
    expect(appSource).toContain('aria-label="ApiaryLens navigation"');
    // Sidebar entries announce the current page to assistive tech.
    expect(appSource).toContain("aria-current={activeSidebar === target ? 'page' : undefined}");
  });

  it('keeps the bottom navigation for narrow viewports', () => {
    expect(appSource).toContain('className="bottom-nav"');
    expect(styles).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.sidebar \{\s*display: none/);
    expect(styles).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.bottom-nav \{\s*display: flex/);
  });

  it('ships both themes: auto via prefers-color-scheme plus explicit overrides', () => {
    expect(styles).toContain('@media (prefers-color-scheme: dark)');
    expect(styles).toContain(":root:where(:not([data-theme='light']))");
    expect(styles).toContain("[data-theme='dark']");
    expect(appSource).toContain('applyThemeMode(document.documentElement, themeMode)');
    expect(appSource).toContain('localStorage.setItem(themeStorageKey, themeMode)');
    expect(shell).toContain('name="theme-color" media="(prefers-color-scheme: light)"');
    expect(shell).toContain('name="theme-color" media="(prefers-color-scheme: dark)"');
  });

  it('uses the validated reference-palette series color in both modes', () => {
    expect(styles).toContain('--series: #2a78d6');
    expect(styles).toContain('--series: #3987e5');
  });

  it('keeps dense tables scrollable inside their panels, never the page', () => {
    expect(styles).toMatch(/\.tbl-wrap \{\s*overflow-x: auto;/);
  });

  it('keeps touch targets at 44px on coarse pointers despite the dense scale', () => {
    expect(styles).toContain('@media (pointer: coarse)');
    expect(styles).toMatch(/@media \(pointer: coarse\)[\s\S]*?min-height: 44px/);
  });

  it('preserves visible keyboard focus in the V2 language', () => {
    expect(styles).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--accent\)/);
  });

  it('offers install only when the browser volunteers an install prompt', () => {
    expect(appSource).toContain("window.addEventListener('beforeinstallprompt', installReady)");
    expect(appSource).toContain('{installPrompt && (');
  });

  it('composes the dashboard from modular blocks the owner can iterate on', () => {
    // The T2 decision recorded the dashboard composition as NOT frozen; each
    // block must stay separable.
    expect(overviewSource).toContain('function HiveStatusBoard');
    expect(overviewSource).toContain('function FollowUpQueue');
    expect(overviewSource).toContain('<WeatherPanel');
    expect(overviewSource).toContain('function GlossaryQuickReference');
    expect(overviewSource).toContain('SeasonHarvestChart');
  });

  it('makes the About page discoverable in the Reference group', () => {
    expect(appSource).toContain("sideNavButton('about', 'ⓘ', 'About')");
    expect(appSource).toContain("page === 'about' && <AboutPage offline={offline} />");
  });

  it('routes the V2 detail screens through the shared page request', () => {
    expect(appSource).toContain("page === 'hive' && pageRequest.hiveId");
    expect(appSource).toContain("page === 'apiary' && pageRequest.apiaryId");
  });
});
