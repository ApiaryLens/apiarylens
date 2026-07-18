import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildMigrationHistory,
  compareVersions,
  evaluateUpdate,
  generateCompatibilityManifest,
  loadEmbeddedMigrationHistory,
  verifyCompatibilityManifest,
} from './compatibility-manifest.mjs';

const releaseManifest = JSON.parse(
  await readFile(new URL('../release/release-manifest.json', import.meta.url), 'utf8'),
);
const migration = await loadEmbeddedMigrationHistory();
const manifest = () => generateCompatibilityManifest(releaseManifest, migration);

describe('semantic version ordering', () => {
  it('orders releases, prereleases, and prerelease identifiers per SemVer', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0-preview.1', '0.1.0-preview.2')).toBeLessThan(0);
    expect(compareVersions('0.1.0-preview.3', '0.1.0-rc.1')).toBeLessThan(0);
    expect(compareVersions('0.1.0-rc.2', '0.1.0')).toBeLessThan(0);
    expect(compareVersions('0.1.0', '0.1.0-preview.3')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0-preview.10', '0.1.0-preview.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0-preview', '0.1.0-preview.1')).toBeLessThan(0);
    expect(() => compareVersions('latest', '0.1.0')).toThrow(/Unparseable/);
  });
});

describe('migration history', () => {
  it('derives the ordered embedded history and a stable digest', () => {
    expect(migration.head).toBe(releaseManifest.contracts.databaseMigration);
    expect(migration.history.map(({ version }) => version)).toEqual([
      '0001',
      '0002',
      '0003',
      '0004',
    ]);
    expect(migration.historyDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(() => buildMigrationHistory({})).toThrow(/No embedded migrations/);
  });

  it('is stable across repeated derivation', async () => {
    expect((await loadEmbeddedMigrationHistory()).historyDigest).toBe(migration.historyDigest);
  });
});

describe('generation and verification', () => {
  it('generates a manifest that passes full verification against the release manifest', () => {
    const generated = manifest();
    expect(verifyCompatibilityManifest(generated, { releaseManifest, migration })).toEqual([]);
    expect(generated.productVersion).toBe(releaseManifest.productVersion);
    expect(generated.migration.head).toBe(releaseManifest.contracts.databaseMigration);
    expect(generated.artifacts.length).toBe(releaseManifest.artifacts.length);
  });

  it('declares exactly one steady-state apply owner for every install channel', () => {
    const generated = manifest();
    const channels = generated.verbOwnership.map((row) => row.installChannel);
    expect(new Set(channels).size).toBe(channels.length);
    expect(channels).toContain('backend-airgap');
    for (const row of generated.verbOwnership) {
      expect(typeof row.steadyStateApply).toBe('string');
      expect(row.steadyStateApply.length).toBeGreaterThan(0);
    }
  });

  it('refuses generation when the release manifest migration head disagrees', () => {
    const drifted = structuredClone(releaseManifest);
    drifted.contracts.databaseMigration = '0009';
    expect(() => generateCompatibilityManifest(drifted, migration)).toThrow(
      /does not match embedded migration head/,
    );
  });
});

describe('hostile fixtures are rejected', () => {
  const breakManifest = (mutate) => {
    const broken = structuredClone(manifest());
    mutate(broken);
    return verifyCompatibilityManifest(broken, { releaseManifest, migration });
  };

  it('rejects a tampered artifact digest', () => {
    const problems = breakManifest((m) => {
      m.artifacts[0].sha256 = 'f'.repeat(64);
    });
    expect(problems.join('\n')).toMatch(/digest or size does not match/);
  });

  it('rejects a removed artifact binding', () => {
    const problems = breakManifest((m) => {
      m.artifacts = m.artifacts.slice(1);
    });
    expect(problems.join('\n')).toMatch(/is not bound in the manifest/);
  });

  it('rejects a mutable latest artifact URL', () => {
    const problems = breakManifest((m) => {
      m.artifacts[0].url = 'https://apiarylens.org/releases/latest/bundle.tar.gz';
    });
    expect(problems.join('\n')).toMatch(/mutable latest pointer/);
  });

  it('rejects a non-https artifact URL', () => {
    const problems = breakManifest((m) => {
      m.artifacts[0].url = 'http://apiarylens.org/releases/x/bundle.tar.gz';
    });
    expect(problems.join('\n')).toMatch(/not pinned to an https URL/);
  });

  it('rejects an unknown channel', () => {
    const problems = breakManifest((m) => {
      m.channel = 'nightly';
    });
    expect(problems.join('\n')).toMatch(/not a known channel/);
  });

  it('rejects a truncated commit identity', () => {
    const problems = breakManifest((m) => {
      m.sourceCommit = 'abc123';
    });
    expect(problems.join('\n')).toMatch(/exact 40-hex commit/);
  });

  it('rejects tampered migration history and digest drift', () => {
    const problems = breakManifest((m) => {
      m.migration.history[1].sha256 = '0'.repeat(64);
    });
    expect(problems.join('\n')).toMatch(/historyDigest does not match|does not match the embedded/);
  });

  it('rejects skipped migration history', () => {
    const problems = breakManifest((m) => {
      m.migration.history.splice(1, 1);
    });
    expect(problems.join('\n')).toMatch(/skipped or out of order/);
  });

  it('rejects a duplicated verb-ownership channel (two claimed apply owners)', () => {
    const problems = breakManifest((m) => {
      m.verbOwnership.push({ ...m.verbOwnership[0], steadyStateApply: 'scout' });
    });
    expect(problems.join('\n')).toMatch(/more than once/);
  });

  it('rejects a missing verb-ownership channel', () => {
    const problems = breakManifest((m) => {
      m.verbOwnership = m.verbOwnership.filter((row) => row.installChannel !== 'backend-airgap');
    });
    expect(problems.join('\n')).toMatch(/missing install channel backend-airgap/);
  });

  it('rejects a minimum direct-upgrade source newer than the release', () => {
    const problems = breakManifest((m) => {
      m.upgrade.minimumDirectUpgradeSource = '9.9.9';
    });
    expect(problems.join('\n')).toMatch(/newer than the release itself/);
  });

  it('rejects a manifest schema version this verifier does not understand', () => {
    const problems = breakManifest((m) => {
      m.manifestSchemaVersion = 99;
    });
    expect(problems.join('\n')).toMatch(/unknown to this verifier/);
  });
});

describe('update evaluation', () => {
  const target = manifest();

  it('accepts a supported forward update on the same channel', () => {
    const result = evaluateUpdate(target, {
      installedVersion: '0.1.0-preview.1',
      installedChannel: target.channel,
    });
    expect(result).toMatchObject({ compatible: true, requiresBackupBeforeUpdate: true });
  });

  it('refuses a same-version reinstall', () => {
    const result = evaluateUpdate(target, {
      installedVersion: target.productVersion,
      installedChannel: target.channel,
    });
    expect(result).toMatchObject({ compatible: false, code: 'not_newer' });
  });

  it('refuses a downgrade', () => {
    const result = evaluateUpdate(target, {
      installedVersion: '9.9.9',
      installedChannel: target.channel,
    });
    expect(result).toMatchObject({ compatible: false, code: 'downgrade' });
  });

  it('refuses an upgrade from below the minimum direct source', () => {
    const result = evaluateUpdate(
      { ...target, upgrade: { ...target.upgrade, minimumDirectUpgradeSource: '0.1.0-preview.2' } },
      { installedVersion: '0.1.0-preview.1', installedChannel: target.channel },
    );
    expect(result).toMatchObject({ compatible: false, code: 'below_minimum_direct_upgrade' });
  });

  it('refuses a silent channel change and allows an explicit one', () => {
    const refused = evaluateUpdate(target, {
      installedVersion: '0.1.0-preview.1',
      installedChannel: 'stable',
    });
    expect(refused).toMatchObject({ compatible: false, code: 'channel_change' });
    const allowed = evaluateUpdate(target, {
      installedVersion: '0.1.0-preview.1',
      installedChannel: 'stable',
      allowChannelChange: true,
    });
    expect(allowed.compatible).toBe(true);
  });

  it('refuses a revoked release', () => {
    const result = evaluateUpdate(
      { ...target, supportStatus: 'revoked' },
      { installedVersion: '0.1.0-preview.1', installedChannel: target.channel },
    );
    expect(result).toMatchObject({ compatible: false, code: 'release_revoked' });
  });

  it('refuses an unknown-ahead manifest schema before anything else', () => {
    const result = evaluateUpdate(
      { ...target, manifestSchemaVersion: 99 },
      { installedVersion: '0.1.0-preview.1', installedChannel: target.channel },
    );
    expect(result).toMatchObject({ compatible: false, code: 'manifest_schema_unknown' });
  });
});
