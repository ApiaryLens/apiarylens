// Compatibility manifest generator and verifier (ADR 0021, work item C5).
//
// The manifest binds a product release's exact identity, artifacts, contract
// identifiers, migration history, upgrade/rollback constraints, and the
// ADR 0025 lifecycle verb-ownership matrix into one canonical, schema-bound
// JSON document. It is shared by the app updater, Scout Bee, CI, and the
// air-gap bundle verifier: generation is deterministic from the committed
// release manifest plus the embedded migration history, and verification is
// fail-closed.
//
// CLI:
//   node scripts/compatibility-manifest.mjs generate [--check]
//   node scripts/compatibility-manifest.mjs verify
//   node scripts/compatibility-manifest.mjs evaluate --installed-version <v>
//     --installed-channel <channel> [--allow-channel-change]

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMPATIBILITY_MANIFEST_SCHEMA_VERSION = 1;

// Earliest release from which a direct upgrade is supported: the first
// published Compose bundle whose migration ledger format and on-host layout
// match the current lifecycle contract.
export const MINIMUM_DIRECT_UPGRADE_SOURCE = '0.1.0-preview.1';

const CHANNELS = ['development', 'preview', 'release-candidate', 'stable'];
const SUPPORT_STATUSES = ['supported', 'superseded', 'revoked'];

// ADR 0025 ownership matrix: exactly one steady-state apply owner per install
// channel, machine-checked here so "Scout and the app can never both claim an
// update" is verified rather than assumed.
export const VERB_OWNERSHIP = [
  {
    installChannel: 'windows-direct',
    firstInstall: 'user-setup',
    steadyStateApply: 'app-self-updater',
    repair: 'app-headless',
    uninstall: 'app-os-entry',
  },
  {
    installChannel: 'windows-scout',
    firstInstall: 'scout-guided',
    steadyStateApply: 'app-self-updater',
    repair: 'scout-or-app-headless',
    uninstall: 'scout-keep-data-or-os-entry',
  },
  {
    installChannel: 'windows-winget',
    firstInstall: 'winget',
    steadyStateApply: 'winget',
    repair: 'app-headless',
    uninstall: 'winget-or-os-entry',
  },
  {
    installChannel: 'windows-chocolatey',
    firstInstall: 'chocolatey',
    steadyStateApply: 'chocolatey',
    repair: 'app-headless',
    uninstall: 'chocolatey',
  },
  {
    installChannel: 'backend-cloudflare',
    firstInstall: 'scout-or-manual',
    steadyStateApply: 'operator',
    repair: 'scout-or-manual',
    uninstall: 'scout-or-manual',
  },
  {
    installChannel: 'backend-compose',
    firstInstall: 'scout-or-manual',
    steadyStateApply: 'operator',
    repair: 'scout-or-manual',
    uninstall: 'scout-or-manual',
  },
  {
    installChannel: 'backend-airgap',
    firstInstall: 'operator-transported-bundle',
    steadyStateApply: 'operator-transported-bundle',
    repair: 'operator-transported-bundle',
    uninstall: 'operator-transported-bundle',
  },
  {
    installChannel: 'scout',
    firstInstall: 'package-manager-or-download',
    steadyStateApply: 'package-manager-or-download',
    repair: 'redownload',
    uninstall: 'package-manager-or-delete',
  },
];

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const releaseManifestPath = join(releaseDirectory, 'release-manifest.json');
const compatibilityManifestPath = join(releaseDirectory, 'compatibility-manifest.json');

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xNumeric !== yNumeric) {
      return xNumeric ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`Unparseable semantic version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

export function buildMigrationHistory(schema) {
  const history = [];
  for (let index = 1; ; index += 1) {
    const version = String(index).padStart(4, '0');
    const sql = schema[`migration${version}`];
    if (typeof sql !== 'string') break;
    history.push({
      version,
      sha256: createHash('sha256').update(sql).digest('hex'),
    });
  }
  if (history.length === 0) throw new Error('No embedded migrations were found');
  const head = history.at(-1).version;
  const historyDigest = createHash('sha256')
    .update(history.map(({ version, sha256 }) => `${version}:${sha256}`).join('\n'))
    .digest('hex');
  return { head, historyDigest, history };
}

export function generateCompatibilityManifest(releaseManifest, migration) {
  if (releaseManifest.contracts.databaseMigration !== migration.head) {
    throw new Error(
      `Release manifest migration head ${releaseManifest.contracts.databaseMigration} does not match embedded migration head ${migration.head}`,
    );
  }
  return {
    $schema: './compatibility-manifest.schema.json',
    manifestKind: 'product-compatibility',
    manifestSchemaVersion: COMPATIBILITY_MANIFEST_SCHEMA_VERSION,
    product: releaseManifest.product,
    releaseKind: 'product',
    productVersion: releaseManifest.productVersion,
    channel: releaseManifest.channel,
    supportStatus: 'supported',
    sourceCommit: releaseManifest.sourceCommit,
    buildTime: releaseManifest.buildTime,
    contracts: { ...releaseManifest.contracts },
    migration,
    upgrade: {
      minimumDirectUpgradeSource: MINIMUM_DIRECT_UPGRADE_SOURCE,
      requiresBackupBeforeUpdate: true,
      backupFormat: 1,
    },
    rollback: {
      allowedWhenMigrationHeadUnchanged: true,
      irreversibleTransitions: [],
      restoreRequiresBackupFormat: 1,
    },
    channelPolicy: {
      default: 'stable',
      previewOptIn: 'explicit',
      releaseCandidateOptIn: 'explicit',
    },
    verbOwnership: VERB_OWNERSHIP,
    artifacts: releaseManifest.artifacts.map(({ name, kind, target, url, sha256, bytes }) => ({
      name,
      kind,
      target,
      url,
      sha256,
      bytes,
    })),
    revokedArtifacts: [],
    knownIssues: [],
    documentation: {
      releaseNotes: `https://apiarylens.org/releases/${releaseManifest.productVersion}/`,
      updateLifecycle:
        'https://github.com/ApiaryLens/apiarylens/blob/main/docs/architecture/versioning-release-and-update-lifecycle.md',
    },
  };
}

export function verifyCompatibilityManifest(manifest, { releaseManifest, migration } = {}) {
  const problems = [];
  const check = (condition, message) => {
    if (!condition) problems.push(message);
  };

  check(manifest.manifestKind === 'product-compatibility', 'manifestKind is not recognized');
  check(
    Number.isInteger(manifest.manifestSchemaVersion) &&
      manifest.manifestSchemaVersion >= 1 &&
      manifest.manifestSchemaVersion <= COMPATIBILITY_MANIFEST_SCHEMA_VERSION,
    `manifestSchemaVersion ${manifest.manifestSchemaVersion} is unknown to this verifier`,
  );
  check(manifest.product === 'ApiaryLens', 'product is not ApiaryLens');
  check(manifest.releaseKind === 'product', 'releaseKind is not product');
  try {
    parseVersion(manifest.productVersion);
  } catch {
    problems.push(`productVersion is not a semantic version: ${manifest.productVersion}`);
  }
  check(CHANNELS.includes(manifest.channel), `channel ${manifest.channel} is not a known channel`);
  check(
    SUPPORT_STATUSES.includes(manifest.supportStatus),
    `supportStatus ${manifest.supportStatus} is not recognized`,
  );
  check(
    typeof manifest.sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(manifest.sourceCommit),
    'sourceCommit is not an exact 40-hex commit',
  );
  check(
    typeof manifest.buildTime === 'string' && manifest.buildTime.length > 0,
    'buildTime is missing',
  );

  const contracts = manifest.contracts ?? {};
  for (const key of ['api', 'sync', 'databaseMigration', 'deploymentPlan', 'export', 'localStore'])
    check(contracts[key] !== undefined, `contracts.${key} is missing`);

  const history = manifest.migration?.history ?? [];
  check(Array.isArray(history) && history.length > 0, 'migration.history is missing');
  check(
    manifest.migration?.head === history.at(-1)?.version,
    'migration.head does not match the final history entry',
  );
  check(
    contracts.databaseMigration === manifest.migration?.head,
    'contracts.databaseMigration does not match migration.head',
  );
  for (const [index, entry] of history.entries()) {
    check(
      entry.version === String(index + 1).padStart(4, '0'),
      `migration.history is skipped or out of order at index ${index}`,
    );
    check(
      typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/.test(entry.sha256),
      `migration.history checksum is invalid for ${entry.version}`,
    );
  }
  if (history.length > 0 && history.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256 ?? ''))) {
    const digest = createHash('sha256')
      .update(history.map(({ version, sha256 }) => `${version}:${sha256}`).join('\n'))
      .digest('hex');
    check(
      manifest.migration?.historyDigest === digest,
      'migration.historyDigest does not match migration.history',
    );
  }

  try {
    check(
      compareVersions(manifest.upgrade?.minimumDirectUpgradeSource, manifest.productVersion) <= 0,
      'upgrade.minimumDirectUpgradeSource is newer than the release itself',
    );
  } catch {
    problems.push('upgrade.minimumDirectUpgradeSource is not a semantic version');
  }
  check(
    manifest.upgrade?.requiresBackupBeforeUpdate === true,
    'upgrade.requiresBackupBeforeUpdate must be true (lifecycle contract)',
  );
  check(
    Number.isInteger(manifest.upgrade?.backupFormat),
    'upgrade.backupFormat must name the required backup format',
  );
  check(
    typeof manifest.rollback?.allowedWhenMigrationHeadUnchanged === 'boolean' &&
      Array.isArray(manifest.rollback?.irreversibleTransitions),
    'rollback constraints are missing',
  );
  check(manifest.channelPolicy?.default === 'stable', 'channelPolicy.default must be stable');

  const ownership = manifest.verbOwnership ?? [];
  check(Array.isArray(ownership) && ownership.length > 0, 'verbOwnership is missing');
  const seenChannels = new Set();
  for (const row of ownership) {
    check(
      typeof row.installChannel === 'string' && row.installChannel.length > 0,
      'verbOwnership row is missing installChannel',
    );
    check(
      !seenChannels.has(row.installChannel),
      `verbOwnership declares install channel ${row.installChannel} more than once`,
    );
    seenChannels.add(row.installChannel);
    for (const verb of ['firstInstall', 'steadyStateApply', 'repair', 'uninstall'])
      check(
        typeof row[verb] === 'string' && row[verb].length > 0 && !Array.isArray(row[verb]),
        `verbOwnership for ${row.installChannel} must name exactly one ${verb} owner`,
      );
  }
  for (const required of VERB_OWNERSHIP.map((row) => row.installChannel))
    check(seenChannels.has(required), `verbOwnership is missing install channel ${required}`);

  const artifacts = manifest.artifacts ?? [];
  check(Array.isArray(artifacts) && artifacts.length > 0, 'artifacts are missing');
  for (const artifact of artifacts) {
    check(
      typeof artifact.sha256 === 'string' && /^[0-9a-f]{64}$/.test(artifact.sha256),
      `artifact ${artifact.name} has no exact sha256`,
    );
    check(
      Number.isInteger(artifact.bytes) && artifact.bytes > 0,
      `artifact ${artifact.name} has no exact size`,
    );
    check(
      typeof artifact.url === 'string' && artifact.url.startsWith('https://'),
      `artifact ${artifact.name} is not pinned to an https URL`,
    );
    check(
      !/latest/i.test(artifact.url),
      `artifact ${artifact.name} URL must not be a mutable latest pointer`,
    );
  }
  check(
    Array.isArray(manifest.revokedArtifacts),
    'revokedArtifacts must be present (may be empty)',
  );

  if (releaseManifest) {
    for (const key of ['productVersion', 'channel', 'sourceCommit', 'buildTime'])
      check(
        manifest[key] === releaseManifest[key],
        `${key} does not match the release manifest (${manifest[key]} != ${releaseManifest[key]})`,
      );
    check(
      JSON.stringify(manifest.contracts) === JSON.stringify(releaseManifest.contracts),
      'contracts do not match the release manifest',
    );
    const byName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));
    for (const artifact of releaseManifest.artifacts) {
      const bound = byName.get(artifact.name);
      check(bound !== undefined, `release artifact ${artifact.name} is not bound in the manifest`);
      if (bound)
        check(
          bound.sha256 === artifact.sha256 && bound.bytes === artifact.bytes,
          `release artifact ${artifact.name} digest or size does not match the release manifest`,
        );
    }
  }
  if (migration) {
    check(
      manifest.migration?.historyDigest === migration.historyDigest,
      'migration history does not match the embedded migrations of this source tree',
    );
  }
  return problems;
}

export function evaluateUpdate(
  manifest,
  { installedVersion, installedChannel, allowChannelChange = false },
) {
  if (
    !Number.isInteger(manifest.manifestSchemaVersion) ||
    manifest.manifestSchemaVersion > COMPATIBILITY_MANIFEST_SCHEMA_VERSION
  ) {
    return {
      compatible: false,
      code: 'manifest_schema_unknown',
      reason: `The target manifest schema ${manifest.manifestSchemaVersion} is newer than this verifier understands; update the verifier first`,
    };
  }
  if (manifest.supportStatus === 'revoked') {
    return {
      compatible: false,
      code: 'release_revoked',
      reason: `${manifest.productVersion} has been revoked and must not be installed`,
    };
  }
  const order = compareVersions(installedVersion, manifest.productVersion);
  if (order === 0) {
    return {
      compatible: false,
      code: 'not_newer',
      reason: `${manifest.productVersion} is already installed`,
    };
  }
  if (order > 0) {
    return {
      compatible: false,
      code: 'downgrade',
      reason: `Installed ${installedVersion} is newer than ${manifest.productVersion}; downgrades require a verified backup restore, not an update`,
    };
  }
  if (compareVersions(installedVersion, manifest.upgrade.minimumDirectUpgradeSource) < 0) {
    return {
      compatible: false,
      code: 'below_minimum_direct_upgrade',
      reason: `Installed ${installedVersion} is older than the minimum directly supported upgrade source ${manifest.upgrade.minimumDirectUpgradeSource}`,
    };
  }
  if (installedChannel !== manifest.channel && !allowChannelChange) {
    return {
      compatible: false,
      code: 'channel_change',
      reason: `Installed channel ${installedChannel} differs from ${manifest.channel}; channel changes require an explicit opt-in`,
    };
  }
  return {
    compatible: true,
    code: 'compatible',
    reason: `Update from ${installedVersion} (${installedChannel}) to ${manifest.productVersion} (${manifest.channel}) is within the supported envelope`,
    requiresBackupBeforeUpdate: manifest.upgrade.requiresBackupBeforeUpdate,
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function importSchemaModule() {
  const schemaUrl = new URL('../packages/database/dist/schema.js', import.meta.url);
  try {
    return await import(schemaUrl.href);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    if (!process.env.npm_execpath) {
      throw new Error(
        'packages/database/dist is not built; run `pnpm --filter @apiarylens/database build` first',
      );
    }
    execFileSync(
      process.execPath,
      [process.env.npm_execpath, '--filter', '@apiarylens/database', 'build'],
      { cwd: root, stdio: 'inherit' },
    );
    return await import(schemaUrl.href);
  }
}

export async function loadEmbeddedMigrationHistory() {
  return buildMigrationHistory(await importSchemaModule());
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function run() {
  const command = process.argv[2];
  const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
  if (command === 'generate') {
    const migration = await loadEmbeddedMigrationHistory();
    const manifest = generateCompatibilityManifest(releaseManifest, migration);
    const problems = verifyCompatibilityManifest(manifest, { releaseManifest, migration });
    if (problems.length > 0) {
      throw new Error(`Generated manifest failed verification:\n- ${problems.join('\n- ')}`);
    }
    const serialized = serializeManifest(manifest);
    if (process.argv.includes('--check')) {
      const committed = readFileSync(compatibilityManifestPath, 'utf8');
      if (committed !== serialized) {
        throw new Error(
          'release/compatibility-manifest.json is out of date; run `node scripts/compatibility-manifest.mjs generate`',
        );
      }
      console.log('Compatibility manifest matches the current source tree.');
      return;
    }
    writeFileSync(compatibilityManifestPath, serialized);
    console.log(
      `Wrote compatibility manifest for ${manifest.product} ${manifest.productVersion} (${manifest.channel}).`,
    );
  } else if (command === 'verify') {
    const manifestPath = argumentValue('--manifest') ?? compatibilityManifestPath;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const migration = await loadEmbeddedMigrationHistory().catch(() => undefined);
    const problems = verifyCompatibilityManifest(manifest, {
      releaseManifest,
      ...(migration ? { migration } : {}),
    });
    if (problems.length > 0) {
      throw new Error(`Compatibility manifest verification failed:\n- ${problems.join('\n- ')}`);
    }
    console.log(
      `Compatibility manifest is valid: ${manifest.product} ${manifest.productVersion} (${manifest.channel}), migration head ${manifest.migration.head}.`,
    );
  } else if (command === 'evaluate') {
    const manifestPath = argumentValue('--manifest') ?? compatibilityManifestPath;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const installedVersion = argumentValue('--installed-version');
    const installedChannel = argumentValue('--installed-channel');
    if (!installedVersion || !installedChannel) {
      throw new Error('evaluate requires --installed-version and --installed-channel');
    }
    const result = evaluateUpdate(manifest, {
      installedVersion,
      installedChannel,
      allowChannelChange: process.argv.includes('--allow-channel-change'),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.compatible) process.exit(65);
  } else {
    throw new Error('Usage: compatibility-manifest.mjs <generate [--check] | verify | evaluate>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
