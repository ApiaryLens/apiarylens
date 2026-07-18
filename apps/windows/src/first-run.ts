import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The two supported Windows application modes (ADR 0015):
 * - `disconnected`: standalone forever — private embedded loopback service,
 *   zero accounts, zero network. Fully usable on this computer alone.
 * - `connected`: the same client speaking publicly trusted HTTPS to a
 *   compatible ApiaryLens backend through an imported connection profile.
 */
export type WindowsMode = 'disconnected' | 'connected';

export type WindowsModeChoice = {
  version: 1;
  mode: WindowsMode;
  chosenAt: string;
};

function validModeChoice(value: unknown): value is WindowsModeChoice {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WindowsModeChoice>;
  return (
    candidate.version === 1 &&
    (candidate.mode === 'disconnected' || candidate.mode === 'connected') &&
    typeof candidate.chosenAt === 'string' &&
    Number.isFinite(Date.parse(candidate.chosenAt))
  );
}

/**
 * Reads the persisted mode choice. A missing or invalid file returns
 * `undefined` so startup falls back to first-run resolution — never to an
 * account prompt.
 */
export function readWindowsModeChoice(path: string): WindowsMode | undefined {
  let raw: string;
  try {
    raw = readFileSync(resolve(path), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return validModeChoice(parsed) ? parsed.mode : undefined;
}

export function saveWindowsModeChoice(path: string, mode: WindowsMode): void {
  const target = resolve(path);
  const temporary = `${target}.tmp`;
  const choice: WindowsModeChoice = { version: 1, mode, chosenAt: new Date().toISOString() };
  writeFileSync(temporary, `${JSON.stringify(choice, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
}

export type WindowsStartupState = {
  savedMode: WindowsMode | undefined;
  connectionProfileExists: boolean;
  standaloneDataExists: boolean;
};

/**
 * First-run detection. `chooser` means a clean profile: no persisted choice,
 * no connected profile, and no standalone data — the only state in which the
 * mode chooser appears. Installs that predate the mode file adopt the mode
 * their existing data implies instead of being sent back through onboarding.
 */
export function resolveWindowsStartupMode(state: WindowsStartupState): WindowsMode | 'chooser' {
  if (state.savedMode === 'disconnected') return 'disconnected';
  if (state.savedMode === 'connected') {
    // A recorded connected choice without its profile is unusable; re-present
    // the chooser rather than guessing a backend.
    return state.connectionProfileExists ? 'connected' : 'chooser';
  }
  if (state.connectionProfileExists) return 'connected';
  if (state.standaloneDataExists) return 'disconnected';
  return 'chooser';
}
