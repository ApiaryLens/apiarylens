import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Package-manager install-source marker (ADR 0025, DIST-001 Finding 4,
 * DIST-002 Finding 4 / pattern 4).
 *
 * One marker schema is shared by every packaged installer. The winget
 * manifest forwards `InstallerSwitches.Custom: --package-manager=winget`
 * through Setup to the app's first run, which writes the marker; the
 * Chocolatey install script either forwards `--package-manager=chocolatey`
 * the same way or writes this exact JSON document itself:
 *
 *   {
 *     "schemaVersion": 1,
 *     "source": "winget" | "chocolatey",
 *     "recordedAt": "<ISO-8601 UTC timestamp>"
 *   }
 *
 * The marker lives in the per-user data root (not the versioned Squirrel
 * `app-<version>` directory) so it survives upgrades. Absence of a marker
 * means the app owns the update apply step (ADR 0025 invariant 3). A marker
 * that exists but cannot be validated fails closed: apply stays suppressed
 * so two updaters can never both claim the install.
 */

export const PACKAGE_MANAGER_ARGUMENT_PREFIX = '--package-manager=';

export const installSourceValues = ['winget', 'chocolatey'] as const;
export type InstallSource = (typeof installSourceValues)[number];

export type InstallSourceMarker = {
  schemaVersion: 1;
  source: InstallSource;
  recordedAt: string;
};

export type InstallOwnership =
  | { owner: 'app'; selfUpdateApplyAllowed: true }
  | { owner: InstallSource | 'unknown'; selfUpdateApplyAllowed: false };

function isInstallSource(value: unknown): value is InstallSource {
  return typeof value === 'string' && (installSourceValues as readonly string[]).includes(value);
}

/** Extracts a forwarded `--package-manager=<source>` install switch, if any. */
export function parsePackageManagerArgument(argv: readonly string[]): InstallSource | undefined {
  const argument = argv.find((entry) => entry.startsWith(PACKAGE_MANAGER_ARGUMENT_PREFIX));
  if (!argument) return undefined;
  const source = argument.slice(PACKAGE_MANAGER_ARGUMENT_PREFIX.length);
  if (!isInstallSource(source)) {
    throw new Error(`Unsupported package manager install source: ${source || '(empty)'}`);
  }
  return source;
}

/**
 * Writes the marker atomically. The most recent install-time source wins:
 * a fresh forwarded switch means a package manager just (re)installed the
 * app, so an existing marker from a previous channel is replaced.
 */
export function writeInstallSourceMarker(
  markerPath: string,
  source: InstallSource,
  now: () => Date = () => new Date(),
): InstallSourceMarker {
  if (!isInstallSource(source)) {
    throw new Error('Refusing to record an unsupported install source');
  }
  const marker: InstallSourceMarker = {
    schemaVersion: 1,
    source,
    recordedAt: now().toISOString(),
  };
  mkdirSync(dirname(markerPath), { recursive: true, mode: 0o700 });
  const temporary = `${markerPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  try {
    renameSync(temporary, markerPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  return marker;
}

/**
 * Reads the marker. Returns `undefined` only when no marker file exists at
 * all (the app-owned channel). Any present-but-invalid marker returns
 * `'invalid'` so callers fail closed instead of silently reclaiming apply
 * ownership from a package manager.
 */
export function readInstallSourceMarker(
  markerPath: string,
): InstallSourceMarker | 'invalid' | undefined {
  let raw: Buffer;
  try {
    const info = lstatSync(markerPath, { throwIfNoEntry: false });
    if (!info) return undefined;
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024) return 'invalid';
    raw = readFileSync(markerPath);
  } catch {
    return 'invalid';
  }
  let value: unknown;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    return 'invalid';
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    !isInstallSource(candidate.source) ||
    typeof candidate.recordedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.recordedAt))
  ) {
    return 'invalid';
  }
  return {
    schemaVersion: 1,
    source: candidate.source,
    recordedAt: candidate.recordedAt,
  };
}

/**
 * Resolves the single steady-state apply owner for this install
 * (ADR 0025 invariant 1). No marker means the app is authoritative;
 * a package-manager marker suppresses the app's self-update apply step
 * (announcement stays allowed); an invalid marker suppresses apply too,
 * because a corrupted arbiter must never create a second live updater.
 */
export function resolveInstallOwnership(markerPath: string): InstallOwnership {
  const marker = readInstallSourceMarker(markerPath);
  if (marker === undefined) return { owner: 'app', selfUpdateApplyAllowed: true };
  if (marker === 'invalid') return { owner: 'unknown', selfUpdateApplyAllowed: false };
  return { owner: marker.source, selfUpdateApplyAllowed: false };
}
