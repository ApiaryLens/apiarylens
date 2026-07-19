import { describe, expect, it } from 'vitest';
import {
  applyThemeMode,
  loadThemeMode,
  nextThemeMode,
  themeModeLabel,
  themeStorageKey,
} from './theme.js';

describe('V2 theme mode control', () => {
  it('cycles Auto → Light → Dark → Auto', () => {
    expect(nextThemeMode('auto')).toBe('light');
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('auto');
  });

  it('sanitizes stored preferences back to Auto', () => {
    expect(loadThemeMode('dark')).toBe('dark');
    expect(loadThemeMode('light')).toBe('light');
    expect(loadThemeMode('auto')).toBe('auto');
    expect(loadThemeMode(null)).toBe('auto');
    expect(loadThemeMode('solarized')).toBe('auto');
    expect(loadThemeMode(42)).toBe('auto');
  });

  it('labels the visible toggle', () => {
    expect(themeModeLabel('auto')).toBe('Theme: Auto');
    expect(themeModeLabel('dark')).toBe('Theme: Dark');
  });

  it('stamps an explicit mode on the root and removes it for Auto', () => {
    const attributes = new Map<string, string>();
    const root = {
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
    };
    applyThemeMode(root, 'dark');
    expect(attributes.get('data-theme')).toBe('dark');
    applyThemeMode(root, 'light');
    expect(attributes.get('data-theme')).toBe('light');
    applyThemeMode(root, 'auto');
    expect(attributes.has('data-theme')).toBe(false);
  });

  it('scopes the stored preference under the app namespace', () => {
    expect(themeStorageKey).toBe('apiarylens:theme');
  });
});
