import { appendFileSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveInstallOwnership, type InstallOwnership } from './install-source.js';

/**
 * Persistent, append-only update ledger (Plan v2 P1-3 / Design v2 R3;
 * the machine-readable arbiter required by ADR 0025 invariant 2).
 *
 * Every applied product update is recorded as one JSON line
 * (version from -> to, UTC timestamp, artifact SHA-256, outcome). The
 * ledger is consulted before any update apply and enforces the accepted
 * update state machine's Preflight rules: a proposed update is REJECTED
 * with a distinct error code when its checksum does not match the release
 * catalog, when it targets a version the catalog does not know, when it
 * skips the release's minimum directly supported upgrade version, when it
 * was planned against a different installed version, or when it moves
 * backward. Whoever applies a package (app, winget, or Chocolatey), the
 * ledger validates the observed result on next launch — package-manager
 * success is never the safety boundary (ADR 0016).
 */

export const UPDATE_LEDGER_SCHEMA_VERSION = 1;

export type UpdateOutcome = 'applied' | 'rejected' | 'failed';

export type UpdateLedgerEntry = {
  schemaVersion: typeof UPDATE_LEDGER_SCHEMA_VERSION;
  /** `null` marks the initial install record that starts the chain. */
  fromVersion: string | null;
  toVersion: string;
  recordedAt: string;
  /**
   * SHA-256 of the applied artifact, or `null` when the update was applied
   * externally (package manager) and observed on next launch, where the
   * app validates identity and health rather than the package bytes.
   */
  artifactSha256: string | null;
  outcome: UpdateOutcome;
  /** Who applied the package: the app itself or a package manager. */
  appliedBy: 'app' | 'winget' | 'chocolatey' | 'unknown';
};

export type ReleaseCatalogEntry = {
  version: string;
  artifactSha256: string;
  /**
   * The oldest installed version this release supports upgrading from
   * directly (lifecycle contract: "Minimum directly supported upgrade
   * version"). An older install must step through intermediates.
   */
  minimumDirectUpgrade?: string;
};

export type UpdatePlan = {
  /** Installed version the plan was computed against. */
  fromVersion: string;
  toVersion: string;
  /** SHA-256 of the downloaded artifact staged for apply. */
  artifactSha256: string;
};

export type UpdateRejectionCode =
  | 'update_checksum_mismatch'
  | 'update_unknown_version'
  | 'update_skipped_version'
  | 'update_out_of_order'
  | 'update_downgrade'
  | 'update_ledger_invalid';

export class UpdateRejectedError extends Error {
  constructor(
    readonly code: UpdateRejectionCode,
    message: string,
  ) {
    super(message);
    this.name = 'UpdateRejectedError';
  }
}

const identifierPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Semantic-version comparison for product release versions
 * (`MAJOR.MINOR.PATCH` with optional prerelease, e.g. `0.1.0-preview.3`).
 */
export function compareProductVersions(left: string, right: string): number {
  const first = identifierPattern.exec(left);
  const second = identifierPattern.exec(right);
  if (!first || !second) {
    throw new UpdateRejectedError(
      'update_unknown_version',
      `A product version is not a valid release version: ${!first ? left : right}`,
    );
  }
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(first[part]) - Number(second[part]);
    if (difference !== 0) return Math.sign(difference);
  }
  const leftPre = first[4];
  const rightPre = second[4];
  if (leftPre === undefined && rightPre === undefined) return 0;
  if (leftPre === undefined) return 1;
  if (rightPre === undefined) return -1;
  const leftParts = leftPre.split('.');
  const rightParts = rightPre.split('.');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b);
      if (difference !== 0) return Math.sign(difference);
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

const entryKeys = new Set([
  'schemaVersion',
  'fromVersion',
  'toVersion',
  'recordedAt',
  'artifactSha256',
  'outcome',
  'appliedBy',
]);

function parseEntry(line: string, index: number): UpdateLedgerEntry {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new UpdateRejectedError(
      'update_ledger_invalid',
      `Update ledger line ${index + 1} is not readable`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UpdateRejectedError(
      'update_ledger_invalid',
      `Update ledger line ${index + 1} is not a record`,
    );
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== entryKeys.size ||
    !keys.every((key) => entryKeys.has(key)) ||
    candidate.schemaVersion !== UPDATE_LEDGER_SCHEMA_VERSION ||
    (candidate.fromVersion !== null && typeof candidate.fromVersion !== 'string') ||
    typeof candidate.toVersion !== 'string' ||
    typeof candidate.recordedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.recordedAt)) ||
    (candidate.artifactSha256 !== null &&
      (typeof candidate.artifactSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(candidate.artifactSha256))) ||
    !['applied', 'rejected', 'failed'].includes(candidate.outcome as string) ||
    !['app', 'winget', 'chocolatey', 'unknown'].includes(candidate.appliedBy as string)
  ) {
    throw new UpdateRejectedError(
      'update_ledger_invalid',
      `Update ledger line ${index + 1} does not match the ledger schema`,
    );
  }
  return candidate as UpdateLedgerEntry;
}

export class UpdateLedger {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }

  /** All recorded entries, oldest first, after chain validation. */
  entries(): UpdateLedgerEntry[] {
    const info = lstatSync(this.path, { throwIfNoEntry: false });
    if (!info) return [];
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new UpdateRejectedError('update_ledger_invalid', 'The update ledger is not a file');
    }
    const lines = readFileSync(this.path, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
    const entries = lines.map(parseEntry);
    let head: string | null = null;
    for (const [index, entry] of entries.entries()) {
      if (entry.outcome !== 'applied') continue;
      if (entry.fromVersion !== head) {
        throw new UpdateRejectedError(
          'update_ledger_invalid',
          `Update ledger entry ${index + 1} does not continue from the recorded installed version`,
        );
      }
      head = entry.toVersion;
    }
    return entries;
  }

  /** The installed version according to the ledger, or `null` before the install record. */
  installedVersion(): string | null {
    const applied = this.entries().filter((entry) => entry.outcome === 'applied');
    return applied.at(-1)?.toVersion ?? null;
  }

  /**
   * Appends one entry. The ledger file only ever grows; recorded history is
   * never rewritten (recovery from a corrupted ledger is an explicit
   * repair/restore, mirroring the WIN-026 migration-ledger rule).
   */
  append(
    entry: Omit<UpdateLedgerEntry, 'schemaVersion' | 'recordedAt'>,
    now: () => Date = () => new Date(),
  ): UpdateLedgerEntry {
    const head = this.installedVersion();
    if (entry.outcome === 'applied' && entry.fromVersion !== head) {
      throw new UpdateRejectedError(
        'update_out_of_order',
        `An applied update must continue from ${head ?? 'a first install'}, not ${entry.fromVersion ?? 'a first install'}`,
      );
    }
    const record: UpdateLedgerEntry = {
      schemaVersion: UPDATE_LEDGER_SCHEMA_VERSION,
      ...entry,
      recordedAt: now().toISOString(),
    };
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    return record;
  }
}

/**
 * Preflight gate: validates a proposed update against the ledger and the
 * release catalog before any apply. Throws `UpdateRejectedError` with a
 * distinct code per rejection class; returns the catalog entry when the
 * update is allowed.
 */
export function assertUpdateAllowed(
  ledger: UpdateLedger,
  plan: UpdatePlan,
  catalog: readonly ReleaseCatalogEntry[],
): ReleaseCatalogEntry {
  const installed = ledger.installedVersion();
  if (installed === null) {
    throw new UpdateRejectedError(
      'update_ledger_invalid',
      'The update ledger has no recorded install to update from',
    );
  }
  if (plan.fromVersion !== installed) {
    throw new UpdateRejectedError(
      'update_out_of_order',
      `The update was planned against ${plan.fromVersion} but ${installed} is installed`,
    );
  }
  const direction = compareProductVersions(plan.toVersion, installed);
  if (direction < 0) {
    throw new UpdateRejectedError(
      'update_downgrade',
      `Refusing to move from ${installed} back to ${plan.toVersion}`,
    );
  }
  if (direction === 0) {
    throw new UpdateRejectedError(
      'update_out_of_order',
      `Version ${plan.toVersion} is already installed`,
    );
  }
  const release = catalog.find((entry) => entry.version === plan.toVersion);
  if (!release) {
    throw new UpdateRejectedError(
      'update_unknown_version',
      `Version ${plan.toVersion} is ahead of every release this build knows`,
    );
  }
  if (
    release.minimumDirectUpgrade !== undefined &&
    compareProductVersions(installed, release.minimumDirectUpgrade) < 0
  ) {
    throw new UpdateRejectedError(
      'update_skipped_version',
      `Version ${plan.toVersion} supports direct upgrade only from ${release.minimumDirectUpgrade} or later; ` +
        `update ${installed} through the intermediate releases first`,
    );
  }
  if (plan.artifactSha256.toLowerCase() !== release.artifactSha256.toLowerCase()) {
    throw new UpdateRejectedError(
      'update_checksum_mismatch',
      `The downloaded artifact for ${plan.toVersion} does not match the release checksum`,
    );
  }
  return release;
}

export type SelfUpdateDecision =
  | { action: 'apply'; release: ReleaseCatalogEntry }
  | { action: 'announce-only'; owner: Exclude<InstallOwnership['owner'], 'app'> };

/**
 * The single self-update APPLY gate (ADR 0025 ownership matrix). When a
 * package-manager marker owns the install, the app may still discover and
 * announce the update but must not apply it; otherwise the ledger preflight
 * decides, throwing a distinct rejection for every unsafe update.
 */
export function preflightSelfUpdate(input: {
  ledger: UpdateLedger;
  installSourceMarkerPath: string;
  plan: UpdatePlan;
  catalog: readonly ReleaseCatalogEntry[];
}): SelfUpdateDecision {
  const ownership = resolveInstallOwnership(input.installSourceMarkerPath);
  if (!ownership.selfUpdateApplyAllowed) {
    return { action: 'announce-only', owner: ownership.owner };
  }
  return { action: 'apply', release: assertUpdateAllowed(input.ledger, input.plan, input.catalog) };
}

/**
 * Next-launch reconciliation: records the running version in the ledger.
 * First launch records the install; a version change since the last entry
 * records who applied it (the install-source marker names the owning
 * package manager). Downgrades observed on disk are recorded as `failed`
 * so support diagnostics show them, without ever advancing history
 * backward silently.
 */
export function reconcileObservedVersion(
  ledger: UpdateLedger,
  runningVersion: string,
  installSourceMarkerPath: string,
): UpdateLedgerEntry | undefined {
  const entries = ledger.entries();
  const installed =
    entries.filter((entry) => entry.outcome === 'applied').at(-1)?.toVersion ?? null;
  if (installed === runningVersion) return undefined;
  const ownership = resolveInstallOwnership(installSourceMarkerPath);
  const appliedBy = ownership.owner === 'app' ? 'app' : ownership.owner;
  if (installed !== null && compareProductVersions(runningVersion, installed) < 0) {
    const last = entries.at(-1);
    if (
      last &&
      last.outcome === 'failed' &&
      last.fromVersion === installed &&
      last.toVersion === runningVersion
    ) {
      return undefined;
    }
    return ledger.append({
      fromVersion: installed,
      toVersion: runningVersion,
      artifactSha256: null,
      outcome: 'failed',
      appliedBy,
    });
  }
  return ledger.append({
    fromVersion: installed,
    toVersion: runningVersion,
    artifactSha256: null,
    outcome: 'applied',
    appliedBy,
  });
}
