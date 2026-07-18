import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeInstallSourceMarker } from './install-source.js';
import {
  UpdateLedger,
  UpdateRejectedError,
  assertUpdateAllowed,
  compareProductVersions,
  preflightSelfUpdate,
  reconcileObservedVersion,
  type ReleaseCatalogEntry,
  type UpdatePlan,
} from './update-ledger.js';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'apiarylens-update-ledger-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, 'updates'), { recursive: true });
  return root;
}

const sha = (seed: string): string => seed.repeat(64).slice(0, 64);

const catalog: readonly ReleaseCatalogEntry[] = [
  { version: '0.1.0-preview.3', artifactSha256: sha('3') },
  { version: '0.1.0-preview.4', artifactSha256: sha('4') },
  { version: '0.1.0', artifactSha256: sha('5'), minimumDirectUpgrade: '0.1.0-preview.4' },
];

function installedLedger(root: string, version = '0.1.0-preview.3'): UpdateLedger {
  const ledger = new UpdateLedger(join(root, 'updates', 'update-ledger.v1.jsonl'));
  ledger.append({
    fromVersion: null,
    toVersion: version,
    artifactSha256: sha('3'),
    outcome: 'applied',
    appliedBy: 'app',
  });
  return ledger;
}

function plan(overrides: Partial<UpdatePlan> = {}): UpdatePlan {
  return {
    fromVersion: '0.1.0-preview.3',
    toVersion: '0.1.0-preview.4',
    artifactSha256: sha('4'),
    ...overrides,
  };
}

function rejectionCode(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    if (error instanceof UpdateRejectedError) return error.code;
    throw error;
  }
  throw new Error('Expected the update to be rejected');
}

describe('product version comparison', () => {
  it('orders releases and prereleases by semantic-version precedence', () => {
    expect(compareProductVersions('0.1.0-preview.3', '0.1.0-preview.4')).toBe(-1);
    expect(compareProductVersions('0.1.0-preview.10', '0.1.0-preview.9')).toBe(1);
    expect(compareProductVersions('0.1.0-preview.4', '0.1.0')).toBe(-1);
    expect(compareProductVersions('0.1.0', '0.1.1')).toBe(-1);
    expect(compareProductVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareProductVersions('0.1.0-alpha.1', '0.1.0-preview.1')).toBe(-1);
    expect(() => compareProductVersions('latest', '0.1.0')).toThrow(UpdateRejectedError);
  });
});

describe('update ledger preflight rejections', () => {
  it('rejects an artifact whose checksum does not match the release catalog', () => {
    const ledger = installedLedger(temporaryRoot());
    expect(
      rejectionCode(() => assertUpdateAllowed(ledger, plan({ artifactSha256: sha('f') }), catalog)),
    ).toBe('update_checksum_mismatch');
  });

  it('rejects an unknown version ahead of every release this build knows', () => {
    const ledger = installedLedger(temporaryRoot());
    expect(
      rejectionCode(() =>
        assertUpdateAllowed(
          ledger,
          plan({ toVersion: '9.9.9', artifactSha256: sha('9') }),
          catalog,
        ),
      ),
    ).toBe('update_unknown_version');
  });

  it('rejects a direct update that skips a required intermediate release', () => {
    const ledger = installedLedger(temporaryRoot());
    expect(
      rejectionCode(() =>
        assertUpdateAllowed(
          ledger,
          plan({ toVersion: '0.1.0', artifactSha256: sha('5') }),
          catalog,
        ),
      ),
    ).toBe('update_skipped_version');
  });

  it('rejects an out-of-order update planned against a version that is not installed', () => {
    const ledger = installedLedger(temporaryRoot());
    expect(
      rejectionCode(() =>
        assertUpdateAllowed(ledger, plan({ fromVersion: '0.1.0-preview.2' }), catalog),
      ),
    ).toBe('update_out_of_order');
    expect(
      rejectionCode(() =>
        assertUpdateAllowed(
          ledger,
          plan({ toVersion: '0.1.0-preview.3', artifactSha256: sha('3') }),
          catalog,
        ),
      ),
    ).toBe('update_out_of_order');
  });

  it('rejects a downgrade below the recorded installed version', () => {
    const ledger = installedLedger(temporaryRoot(), '0.1.0-preview.4');
    expect(
      rejectionCode(() =>
        assertUpdateAllowed(
          ledger,
          {
            fromVersion: '0.1.0-preview.4',
            toVersion: '0.1.0-preview.3',
            artifactSha256: sha('3'),
          },
          catalog,
        ),
      ),
    ).toBe('update_downgrade');
  });

  it('allows the supported stepwise update and records it append-only', () => {
    const root = temporaryRoot();
    const ledger = installedLedger(root);
    const release = assertUpdateAllowed(ledger, plan(), catalog);
    expect(release.version).toBe('0.1.0-preview.4');
    ledger.append({
      fromVersion: '0.1.0-preview.3',
      toVersion: release.version,
      artifactSha256: release.artifactSha256,
      outcome: 'applied',
      appliedBy: 'app',
    });
    expect(ledger.installedVersion()).toBe('0.1.0-preview.4');
    const reopened = new UpdateLedger(join(root, 'updates', 'update-ledger.v1.jsonl'));
    expect(reopened.installedVersion()).toBe('0.1.0-preview.4');
    expect(reopened.entries()).toHaveLength(2);
    const nowAllowed = assertUpdateAllowed(
      reopened,
      { fromVersion: '0.1.0-preview.4', toVersion: '0.1.0', artifactSha256: sha('5') },
      catalog,
    );
    expect(nowAllowed.version).toBe('0.1.0');
  });
});

describe('update ledger integrity', () => {
  it('refuses to append an applied entry that does not continue the chain', () => {
    const ledger = installedLedger(temporaryRoot());
    expect(
      rejectionCode(() =>
        ledger.append({
          fromVersion: '0.1.0-preview.1',
          toVersion: '0.1.0-preview.4',
          artifactSha256: sha('4'),
          outcome: 'applied',
          appliedBy: 'app',
        }),
      ),
    ).toBe('update_out_of_order');
  });

  it('fails closed when the persisted ledger is tampered or unreadable', () => {
    const root = temporaryRoot();
    const path = join(root, 'updates', 'update-ledger.v1.jsonl');
    installedLedger(root);
    appendFileSync(path, 'not-json\n');
    expect(rejectionCode(() => new UpdateLedger(path).entries())).toBe('update_ledger_invalid');

    const broken = join(root, 'updates', 'broken.v1.jsonl');
    const chainBreak = new UpdateLedger(broken);
    writeFileSync(
      broken,
      [
        JSON.stringify({
          schemaVersion: 1,
          fromVersion: null,
          toVersion: '0.1.0-preview.3',
          recordedAt: new Date().toISOString(),
          artifactSha256: sha('3'),
          outcome: 'applied',
          appliedBy: 'app',
        }),
        JSON.stringify({
          schemaVersion: 1,
          fromVersion: '0.1.0-preview.1',
          toVersion: '0.1.0-preview.4',
          recordedAt: new Date().toISOString(),
          artifactSha256: sha('4'),
          outcome: 'applied',
          appliedBy: 'app',
        }),
        '',
      ].join('\n'),
    );
    expect(rejectionCode(() => chainBreak.entries())).toBe('update_ledger_invalid');
  });

  it('rejects preflight when no install has ever been recorded', () => {
    const root = temporaryRoot();
    const ledger = new UpdateLedger(join(root, 'updates', 'update-ledger.v1.jsonl'));
    expect(rejectionCode(() => assertUpdateAllowed(ledger, plan(), catalog))).toBe(
      'update_ledger_invalid',
    );
  });

  it('treats an external_unverified entry as the chain head that later entries continue from', () => {
    const ledger = installedLedger(temporaryRoot());
    ledger.append({
      fromVersion: '0.1.0-preview.3',
      toVersion: '9.9.9',
      artifactSha256: null,
      outcome: 'external_unverified',
      appliedBy: 'winget',
    });
    expect(ledger.installedVersion()).toBe('9.9.9');
    expect(
      rejectionCode(() =>
        ledger.append({
          fromVersion: '0.1.0-preview.3',
          toVersion: '0.1.0-preview.4',
          artifactSha256: sha('4'),
          outcome: 'applied',
          appliedBy: 'app',
        }),
      ),
    ).toBe('update_out_of_order');
  });

  it('keeps rejected outcomes in history without advancing the installed version', () => {
    const ledger = installedLedger(temporaryRoot());
    ledger.append({
      fromVersion: '0.1.0-preview.3',
      toVersion: '0.1.0-preview.4',
      artifactSha256: sha('f'),
      outcome: 'rejected',
      appliedBy: 'app',
    });
    expect(ledger.installedVersion()).toBe('0.1.0-preview.3');
    expect(ledger.entries()).toHaveLength(2);
  });
});

describe('self-update apply suppression', () => {
  it('suppresses apply when a winget marker owns the install but still allows announcement', () => {
    const root = temporaryRoot();
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    writeInstallSourceMarker(markerPath, 'winget');
    const decision = preflightSelfUpdate({
      ledger: installedLedger(root),
      installSourceMarkerPath: markerPath,
      plan: plan(),
      catalog,
    });
    expect(decision).toEqual({ action: 'announce-only', owner: 'winget' });
  });

  it('suppresses apply when a chocolatey marker owns the install', () => {
    const root = temporaryRoot();
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    writeInstallSourceMarker(markerPath, 'chocolatey');
    const decision = preflightSelfUpdate({
      ledger: installedLedger(root),
      installSourceMarkerPath: markerPath,
      plan: plan(),
      catalog,
    });
    expect(decision).toEqual({ action: 'announce-only', owner: 'chocolatey' });
  });

  it('fails closed to announce-only when the marker exists but cannot be trusted', () => {
    const root = temporaryRoot();
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    writeFileSync(markerPath, '{"schemaVersion":1,"source":"apt","recordedAt":"junk"}');
    const decision = preflightSelfUpdate({
      ledger: installedLedger(root),
      installSourceMarkerPath: markerPath,
      plan: plan(),
      catalog,
    });
    expect(decision).toEqual({ action: 'announce-only', owner: 'unknown' });
  });

  it('keeps the app authoritative when no marker exists, still enforcing the ledger', () => {
    const root = temporaryRoot();
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    const ledger = installedLedger(root);
    const allowed = preflightSelfUpdate({
      ledger,
      installSourceMarkerPath: markerPath,
      plan: plan(),
      catalog,
    });
    expect(allowed.action).toBe('apply');
    expect(() =>
      preflightSelfUpdate({
        ledger,
        installSourceMarkerPath: markerPath,
        plan: plan({ artifactSha256: sha('f') }),
        catalog,
      }),
    ).toThrow(UpdateRejectedError);
  });
});

describe('next-launch reconciliation', () => {
  it('records the first install and package-manager-applied updates with their owner', () => {
    const root = temporaryRoot();
    const path = join(root, 'updates', 'update-ledger.v1.jsonl');
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    const ledger = new UpdateLedger(path);
    const install = reconcileObservedVersion(ledger, '0.1.0-preview.3', markerPath, catalog);
    expect(install).toMatchObject({
      fromVersion: null,
      toVersion: '0.1.0-preview.3',
      outcome: 'applied',
      appliedBy: 'app',
    });
    expect(
      reconcileObservedVersion(ledger, '0.1.0-preview.3', markerPath, catalog),
    ).toBeUndefined();

    writeInstallSourceMarker(markerPath, 'winget');
    const upgraded = reconcileObservedVersion(ledger, '0.1.0-preview.4', markerPath, catalog);
    expect(upgraded).toMatchObject({
      fromVersion: '0.1.0-preview.3',
      toVersion: '0.1.0-preview.4',
      artifactSha256: null,
      outcome: 'applied',
      appliedBy: 'winget',
    });
    expect(ledger.installedVersion()).toBe('0.1.0-preview.4');
  });

  it('records an observed on-disk downgrade as failed exactly once and never advances backward', () => {
    const root = temporaryRoot();
    const path = join(root, 'updates', 'update-ledger.v1.jsonl');
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    const ledger = installedLedger(root, '0.1.0-preview.4');
    const observed = reconcileObservedVersion(ledger, '0.1.0-preview.3', markerPath, catalog);
    expect(observed).toMatchObject({
      fromVersion: '0.1.0-preview.4',
      toVersion: '0.1.0-preview.3',
      outcome: 'failed',
      appliedBy: 'app',
    });
    expect(ledger.installedVersion()).toBe('0.1.0-preview.4');
    expect(
      reconcileObservedVersion(ledger, '0.1.0-preview.3', markerPath, catalog),
    ).toBeUndefined();
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('never records an external update to a version the catalog does not know as applied', () => {
    const root = temporaryRoot();
    const path = join(root, 'updates', 'update-ledger.v1.jsonl');
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    const ledger = installedLedger(root);
    writeInstallSourceMarker(markerPath, 'winget');
    const observed = reconcileObservedVersion(ledger, '9.9.9', markerPath, catalog);
    expect(observed).toMatchObject({
      fromVersion: '0.1.0-preview.3',
      toVersion: '9.9.9',
      artifactSha256: null,
      outcome: 'external_unverified',
      appliedBy: 'winget',
    });
    // The chain stays intact and append-only: the unverified head is a fact
    // on disk, recorded once, and survives a reload without becoming clean.
    expect(ledger.installedVersion()).toBe('9.9.9');
    expect(reconcileObservedVersion(ledger, '9.9.9', markerPath, catalog)).toBeUndefined();
    const reopened = new UpdateLedger(path);
    expect(reopened.entries().at(-1)?.outcome).toBe('external_unverified');
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('flags an external update that skips the minimum directly supported upgrade version', () => {
    const root = temporaryRoot();
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    const ledger = installedLedger(root); // 0.1.0-preview.3; 0.1.0 requires preview.4 first
    writeInstallSourceMarker(markerPath, 'chocolatey');
    const observed = reconcileObservedVersion(ledger, '0.1.0', markerPath, catalog);
    expect(observed).toMatchObject({
      fromVersion: '0.1.0-preview.3',
      toVersion: '0.1.0',
      outcome: 'external_unverified',
      appliedBy: 'chocolatey',
    });
    expect(ledger.installedVersion()).toBe('0.1.0');
  });

  it('applies the same known-version rules the preflight gate enforces to the stepwise path', () => {
    const root = temporaryRoot();
    const markerPath = join(root, 'updates', 'install-source.v1.json');
    const ledger = installedLedger(root);
    writeInstallSourceMarker(markerPath, 'winget');
    expect(reconcileObservedVersion(ledger, '0.1.0-preview.4', markerPath, catalog)).toMatchObject({
      outcome: 'applied',
    });
    expect(reconcileObservedVersion(ledger, '0.1.0', markerPath, catalog)).toMatchObject({
      fromVersion: '0.1.0-preview.4',
      toVersion: '0.1.0',
      outcome: 'applied',
      appliedBy: 'winget',
    });
  });
});
