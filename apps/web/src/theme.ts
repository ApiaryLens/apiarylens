/**
 * V2 "Clean Dashboard" theme control. The design ships both a light and a dark
 * theme; Auto follows the operating system (prefers-color-scheme in CSS), and
 * an explicit choice is stamped onto <html data-theme> and remembered on this
 * device only. No preference ever leaves the device.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

export const themeStorageKey = 'apiarylens:theme';

const modes: readonly ThemeMode[] = ['auto', 'light', 'dark'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (modes as readonly string[]).includes(value);
}

/** Sanitize a stored preference; anything unrecognized falls back to Auto. */
export function loadThemeMode(stored: unknown): ThemeMode {
  return isThemeMode(stored) ? stored : 'auto';
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'auto';
}

export function themeModeLabel(mode: ThemeMode): string {
  return `Theme: ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
}

/**
 * Apply a mode to the document root. Auto removes the attribute so the
 * prefers-color-scheme media query decides; an explicit mode overrides it.
 */
export function applyThemeMode(
  root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
  mode: ThemeMode,
): void {
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}
