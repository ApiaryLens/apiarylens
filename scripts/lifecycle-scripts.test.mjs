// Negative-path and unit coverage for the POSIX lifecycle scripts in
// scripts/lifecycle/ (C4 / OPREM-001 gaps G6 and G7): update-ledger refusal
// rules, semantic version ordering, and the offline bundle verifier's
// hostile fixtures. The full install/update/rollback flows require Docker
// and run in .github/workflows/airgap-verification.yml.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const posix = (path) => path.replaceAll('\\', '/');
const lifecycleDir = posix(join(import.meta.dirname, 'lifecycle'));
const bashAvailable = spawnSync('bash', ['-c', 'true']).status === 0;
const suite = bashAvailable ? describe : describe.skip;

let root;

beforeEach(() => {
  root = posix(mkdtempSync(join(tmpdir(), 'apiarylens-lifecycle-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function sh(script) {
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function lib(target, body) {
  return sh(`set -eu; . '${lifecycleDir}/lib.sh'; target='${target}'; ${body}`);
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

function writeBundle(overrides = {}) {
  const bundleDir = join(root, 'bundle');
  mkdirSync(join(bundleDir, 'images'), { recursive: true });
  const manifest = {
    bundleFormat: 1,
    product: 'ApiaryLens',
    productVersion: '0.1.0-preview.3',
    channel: 'preview',
    sourceCommit: 'a'.repeat(40),
    buildTime: '2026-07-18T00:00:00.000Z',
    artifactIdentity: 'ApiaryLens@0.1.0-preview.3+aaaaaaa',
    migrationHead: '0004',
    minimumDirectUpgradeSource: '0.1.0-preview.1',
    imagesArchive: 'images/apiarylens-images-0.1.0-preview.3.tar',
    minimumComposeVersion: '2.24.0',
    requiredDiskHeadroomGiB: 10,
    ...overrides,
  };
  const members = new Map([
    ['bundle-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['compatibility-manifest.json', '{\n  "manifestKind": "product-compatibility"\n}\n'],
    ['release-identity.json', '{\n  "productVersion": "0.1.0-preview.3"\n}\n'],
    ['images/apiarylens-images-0.1.0-preview.3.tar', 'fake-image-archive-bytes'],
  ]);
  for (const [name, content] of members) writeFileSync(join(bundleDir, name), content);
  const checksums = [...members].map(([name, content]) => `${sha256(content)}  ${name}`).join('\n');
  writeFileSync(join(bundleDir, 'checksums.sha256'), `${checksums}\n`);
  return posix(bundleDir);
}

function writeInstalledIdentity(version, channel = 'preview') {
  mkdirSync(join(root, 'current'), { recursive: true });
  writeFileSync(
    join(root, 'current', 'release-identity.json'),
    `${JSON.stringify({ product: 'ApiaryLens', productVersion: version, channel }, null, 2)}\n`,
  );
}

function verifyBundle(bundleDir, extra = '') {
  return sh(`bash '${lifecycleDir}/verify-bundle.sh' --bundle-dir '${bundleDir}' ${extra}`);
}

suite('semantic version comparison (lib.sh)', () => {
  const compare = (a, b) => lib(root, `al_compare_versions '${a}' '${b}'`).stdout.trim();

  it('orders base versions numerically', () => {
    expect(compare('0.1.0', '0.1.0')).toBe('eq');
    expect(compare('0.1.0', '0.2.0')).toBe('lt');
    expect(compare('0.10.0', '0.9.0')).toBe('gt');
  });

  it('ranks a release above its own prereleases', () => {
    expect(compare('0.1.0', '0.1.0-rc.2')).toBe('gt');
    expect(compare('0.1.0-preview.3', '0.1.0')).toBe('lt');
  });

  it('orders prerelease identifiers with numeric segments', () => {
    expect(compare('0.1.0-preview.9', '0.1.0-preview.10')).toBe('lt');
    expect(compare('0.1.0-preview.3', '0.1.0-rc.1')).toBe('lt');
  });
});

suite('flat JSON extraction (lib.sh)', () => {
  it('reads string and numeric scalars from generated manifests', () => {
    const path = join(root, 'manifest.json');
    writeFileSync(path, '{\n  "productVersion": "1.2.3-rc.1",\n  "bundleFormat": 1\n}\n');
    expect(lib(root, `al_json_get '${posix(path)}' productVersion`).stdout.trim()).toBe(
      '1.2.3-rc.1',
    );
    expect(lib(root, `al_json_get '${posix(path)}' bundleFormat`).stdout.trim()).toBe('1');
  });
});

suite('update ledger rules (G6)', () => {
  it('appends shape-valid entries that pass verification', () => {
    const append = lib(
      root,
      'al_ledger_append install "" 0.1.0-preview.3 "" 0004 "" committed; al_ledger_verify; al_ledger_last_outcome',
    );
    expect(append.status).toBe(0);
    expect(append.stdout.trim()).toBe('committed');
  });

  it('refuses every operation over a tampered ledger', () => {
    mkdirSync(join(root, 'lifecycle'), { recursive: true });
    writeFileSync(
      join(root, 'lifecycle', 'update-ledger.jsonl'),
      '{"at":"2026-07-18T00:00:00Z","operation":"install","fromVersion":"","toVersion":"0.1.0","bundleDigest":"","migrationHead":"0004","backupPath":"","outcome":"committed"}\nnot json at all\n',
    );
    const result = lib(root, 'al_ledger_require_ready');
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/tampered or corrupted/);
  });

  it('refuses a new operation while the last entry is still staged, unless forced', () => {
    const staged = lib(
      root,
      'al_ledger_append update 0.1.0-preview.2 0.1.0-preview.3 "" 0004 "" staged; al_ledger_require_ready',
    );
    expect(staged.status).toBe(65);
    expect(staged.stderr).toMatch(/interrupted operation/);
    const forced = lib(
      root,
      'al_ledger_append update 0.1.0-preview.2 0.1.0-preview.3 "" 0004 "" staged; force=true; al_ledger_require_ready',
    );
    expect(forced.status).toBe(0);
  });
});

suite('offline bundle verifier (G7 hostile fixtures)', () => {
  it('accepts an intact bundle', () => {
    const result = verifyBundle(writeBundle());
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Bundle verification passed/);
  });

  it('rejects a tampered member', () => {
    const bundleDir = writeBundle();
    writeFileSync(
      join(bundleDir, 'images', 'apiarylens-images-0.1.0-preview.3.tar'),
      'tampered-image-archive-bytes',
    );
    const result = verifyBundle(bundleDir);
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/corrupted or tampered/);
  });

  it('rejects a tampered manifest', () => {
    const bundleDir = writeBundle();
    const manifestPath = join(bundleDir, 'bundle-manifest.json');
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ bundleFormat: 1, productVersion: '9.9.9' }, null, 2)}\n`,
    );
    const result = verifyBundle(bundleDir);
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/corrupted or tampered/);
  });

  it('rejects a bundle with a missing member', () => {
    const bundleDir = writeBundle();
    rmSync(join(bundleDir, 'release-identity.json'));
    const result = verifyBundle(bundleDir);
    expect(result.status).toBe(65);
  });

  it('rejects an unknown-ahead bundle format', () => {
    const result = verifyBundle(writeBundle({ bundleFormat: 2 }));
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/newer than this verifier/);
  });

  it('rejects a same-version reinstall as an update', () => {
    writeInstalledIdentity('0.1.0-preview.3');
    const result = verifyBundle(writeBundle(), `--target '${root}'`);
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/already installed/);
  });

  it('rejects a downgrade', () => {
    writeInstalledIdentity('0.1.0');
    const result = verifyBundle(writeBundle(), `--target '${root}'`);
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/downgrades require a verified backup restore/);
  });

  it('rejects an install older than the minimum direct-upgrade source', () => {
    writeInstalledIdentity('0.1.0-preview.1');
    const result = verifyBundle(
      writeBundle({ minimumDirectUpgradeSource: '0.1.0-preview.2' }),
      `--target '${root}'`,
    );
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/minimum directly supported upgrade source/);
  });

  it('rejects a silent channel change and honors the explicit opt-in', () => {
    writeInstalledIdentity('0.1.0-preview.2', 'stable');
    const refused = verifyBundle(writeBundle(), `--target '${root}'`);
    expect(refused.status).toBe(65);
    expect(refused.stderr).toMatch(/--allow-channel-change/);
    const allowed = verifyBundle(writeBundle(), `--target '${root}' --allow-channel-change`);
    expect(allowed.status).toBe(0);
  });

  it('accepts a supported forward update', () => {
    writeInstalledIdentity('0.1.0-preview.2');
    const result = verifyBundle(writeBundle(), `--target '${root}'`);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/within the supported envelope/);
  });
});
