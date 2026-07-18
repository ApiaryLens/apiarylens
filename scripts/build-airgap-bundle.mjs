// Air-gap deployment bundle builder (OPREM-001 / Design v2 R4).
//
// Builds the Compose product images on the connected side, saves them as one
// multi-image docker archive (shared base layers deduplicated, repo:tags
// preserved for `docker load`), and assembles the offline bundle:
//
//   apiarylens-<version>-airgap-<sha12>.tar
//     bundle-manifest.json          identity, image IDs, pinned minimums,
//                                   member digests (flat keys, sed-readable)
//     compatibility-manifest.json   canonical ADR 0021 manifest
//     release-identity.json         same identity block as other bundles
//     checksums.sha256              sha256sum -c over every member
//     images/apiarylens-images-<version>.tar
//     compose/                      compose.yaml + air-gap override + Caddyfiles
//     migrations/migration-history.json
//     scripts/                      offline lifecycle scripts (C4)
//     docs/AIRGAP.md                transported-update runbook
//
// The outer tar is uncompressed on purpose: the image layers inside are
// already compressed, and a flat tar keeps `sha256sum -c` and resumable
// transport copies cheap on multi-gigabyte bundles.
//
// Run through `pnpm release:airgap` after `pnpm release:artifacts`. Requires
// Docker Engine with the Compose v2 plugin on the build machine.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import prettier from 'prettier';
import { createTar } from './release-archive.mjs';
import {
  generateCompatibilityManifest,
  loadEmbeddedMigrationHistory,
  serializeManifest,
} from './compatibility-manifest.mjs';

const run = promisify(execFile);

// Tested support floor recorded in the bundle manifest: `!reset` in the
// compose override requires Compose v2.24; `pull_policy: never` requires
// v2.13; multi-image `docker save`/`docker load` is stable far earlier.
const MINIMUM_DOCKER_ENGINE = '24.0.0';
const MINIMUM_COMPOSE_VERSION = '2.24.0';
const REQUIRED_DISK_HEADROOM_GIB = 10;
const HELPER_IMAGE = 'alpine:3.22';

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const artifactDirectory = join(releaseDirectory, 'artifacts');
const manifestPath = join(releaseDirectory, 'release-manifest.json');

if (!process.env.npm_execpath) {
  throw new Error('Run air-gap bundle assembly through `pnpm release:airgap`.');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const version = manifest.productVersion;
const artifactIdentity = `ApiaryLens@${version}+${manifest.sourceCommit.slice(0, 7)}`;
const apiImage = `apiarylens-api:${version}`;
const webImage = `apiarylens-web:${version}`;
const imagesArchiveName = `images/apiarylens-images-${version}.tar`;

const migration = await loadEmbeddedMigrationHistory();
const compatibility = generateCompatibilityManifest(manifest, migration);

const dockerEnvironment = {
  ...process.env,
  APIARYLENS_VERSION: version,
  APIARYLENS_SOURCE_COMMIT: manifest.sourceCommit,
  APIARYLENS_BUILD_TIME: manifest.buildTime,
  APIARYLENS_ARTIFACT_IDENTITY: artifactIdentity,
};
const docker = (args, options = {}) =>
  run('docker', args, {
    cwd: root,
    env: dockerEnvironment,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

console.log(`Building ${apiImage} and ${webImage} from the pinned Dockerfiles...`);
await docker(['compose', '-f', 'docker/compose.yaml', 'build', '--pull']);
await docker(['pull', HELPER_IMAGE]);

const imageId = async (reference) =>
  (await docker(['image', 'inspect', '--format', '{{.Id}}', reference])).stdout.trim();
const apiImageId = await imageId(apiImage);
const webImageId = await imageId(webImage);
const helperImageId = await imageId(HELPER_IMAGE);

const builtWithDockerEngine = (
  await docker(['version', '--format', '{{.Server.Version}}'])
).stdout.trim();
const builtWithComposeVersion = (await docker(['compose', 'version', '--short'])).stdout
  .trim()
  .replace(/^v/, '');

console.log(`Saving ${apiImage}, ${webImage}, and ${HELPER_IMAGE} into one image archive...`);
const scratch = join(tmpdir(), `apiarylens-airgap-${process.pid}`);
await mkdir(scratch, { recursive: true });
const imagesArchivePath = join(scratch, 'images.tar');
try {
  await docker(['save', '-o', imagesArchivePath, apiImage, webImage, HELPER_IMAGE]);
  const imagesArchive = await readFile(imagesArchivePath);

  const identity = Buffer.from(
    `${JSON.stringify(
      {
        product: manifest.product,
        productVersion: version,
        channel: manifest.channel,
        sourceCommit: manifest.sourceCommit,
        buildTime: manifest.buildTime,
        contracts: manifest.contracts,
      },
      null,
      2,
    )}\n`,
  );

  const files = new Map();
  files.set('release-identity.json', identity);
  files.set('compatibility-manifest.json', Buffer.from(serializeManifest(compatibility)));
  files.set(imagesArchiveName, imagesArchive);
  for (const name of [
    'compose.yaml',
    'compose.airgap.yaml',
    'Caddyfile',
    'Caddyfile.backend-only',
    '.env.example',
  ]) {
    files.set(`compose/${name}`, await readFile(join(root, 'docker', name)));
  }
  files.set(
    'migrations/migration-history.json',
    Buffer.from(`${JSON.stringify(migration, null, 2)}\n`),
  );
  const lifecycleDirectory = join(root, 'scripts', 'lifecycle');
  for (const name of (await readdir(lifecycleDirectory)).sort()) {
    // Shell scripts must reach the target host executable and LF-normalized
    // regardless of the checkout's line-ending configuration.
    const content = Buffer.from(
      (await readFile(join(lifecycleDirectory, name), 'utf8')).replaceAll('\r\n', '\n'),
    );
    files.set(`scripts/${name}`, { content, mode: name.endsWith('.sh') ? 0o755 : 0o644 });
  }
  files.set('docs/AIRGAP.md', await readFile(join(root, 'docs', 'deployment', 'airgap-bundle.md')));

  const digestOf = (member) =>
    createHash('sha256')
      .update(Buffer.isBuffer(member) ? member : member.content)
      .digest('hex');
  const memberDigests = Object.fromEntries(
    [...files.entries()].map(([name, member]) => [name, digestOf(member)]).sort(),
  );

  // Flat scalar keys on purpose: the offline verifier reads them with sed
  // before any JSON-capable tooling from the bundle has been loaded.
  const bundleManifest = {
    bundleFormat: 1,
    product: manifest.product,
    productVersion: version,
    channel: manifest.channel,
    sourceCommit: manifest.sourceCommit,
    buildTime: manifest.buildTime,
    artifactIdentity,
    migrationHead: migration.head,
    minimumDirectUpgradeSource: compatibility.upgrade.minimumDirectUpgradeSource,
    imagesArchive: imagesArchiveName,
    apiImage,
    apiImageId,
    webImage,
    webImageId,
    helperImage: HELPER_IMAGE,
    helperImageId,
    minimumDockerEngine: MINIMUM_DOCKER_ENGINE,
    minimumComposeVersion: MINIMUM_COMPOSE_VERSION,
    builtWithDockerEngine,
    builtWithComposeVersion,
    requiredDiskHeadroomGiB: REQUIRED_DISK_HEADROOM_GIB,
    files: memberDigests,
  };
  files.set('bundle-manifest.json', Buffer.from(`${JSON.stringify(bundleManifest, null, 2)}\n`));

  const checksumLines = [...files.entries()]
    .map(([name, member]) => `${digestOf(member)}  ${name}`)
    .sort((a, b) => a.slice(66).localeCompare(b.slice(66)))
    .join('\n');
  files.set('checksums.sha256', Buffer.from(`${checksumLines}\n`));

  const archive = createTar(files);
  const sha256 = createHash('sha256').update(archive).digest('hex');
  const stem = `apiarylens-${version}-airgap`;
  const name = `${stem}-${sha256.slice(0, 12)}.tar`;
  await mkdir(artifactDirectory, { recursive: true });
  for (const existing of await readdir(artifactDirectory)) {
    if (existing.startsWith(stem)) await rm(join(artifactDirectory, existing), { force: true });
  }
  await writeFile(join(artifactDirectory, name), archive, { mode: 0o644 });

  manifest.artifacts = [
    ...manifest.artifacts.filter((artifact) => artifact.target !== 'airgap'),
    {
      name,
      kind: 'deployment-bundle',
      target: 'airgap',
      url: `https://apiarylens.org/releases/${version}/artifacts/${name}`,
      sha256,
      bytes: archive.length,
    },
  ];
  await writeFile(
    manifestPath,
    await prettier.format(JSON.stringify(manifest), { parser: 'json' }),
  );
  console.log(
    `Built air-gap bundle ${name} (${(archive.length / 1024 / 1024).toFixed(1)} MiB): api ${apiImageId.slice(7, 19)}, web ${webImageId.slice(7, 19)}, helper ${helperImageId.slice(7, 19)}.`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
