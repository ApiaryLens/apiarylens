import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import prettier from 'prettier';
import { addTree, createTar, readTreeText } from './release-archive.mjs';

const run = promisify(execFile);

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const artifactDirectory = join(releaseDirectory, 'artifacts');
const manifestPath = join(releaseDirectory, 'release-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const version = manifest.productVersion;
const artifactIdentity = `ApiaryLens@${version}+${manifest.sourceCommit.slice(0, 7)}`;

await mkdir(artifactDirectory, { recursive: true });

await buildReleaseInputs();

const workerOutput = await readFile(join(root, 'apps/worker/dist/index.js'), 'utf8');
const compiledWorkerVersions = [
  ...workerOutput.matchAll(/\bPRODUCT_VERSION\s*=\s*["']([^"']+)["']/g),
].map((match) => match[1]);
if (!compiledWorkerVersions.includes(version)) {
  throw new Error(
    `Worker runtime identity mismatch: expected ${version}, found ${compiledWorkerVersions.join(', ') || 'no compiled PRODUCT_VERSION'}`,
  );
}

const webOutput = await readTreeText(join(root, 'apps/web/dist'), (name) => name.endsWith('.js'));
for (const [label, expected] of [
  ['version', version],
  ['source commit', manifest.sourceCommit],
  ['build time', manifest.buildTime],
  ['artifact identity', artifactIdentity],
]) {
  if (!webOutput.includes(expected))
    throw new Error(`Web release build does not contain the expected ${label}: ${expected}`);
}

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

const cloudflareFiles = new Map([
  ['release-identity.json', identity],
  ['worker/index.js', Buffer.from(workerOutput)],
]);
await addTree(cloudflareFiles, join(root, 'apps/worker/migrations'), 'worker/migrations');
await addTree(cloudflareFiles, join(root, 'apps/web/dist'), 'web');

const composeFiles = new Map([['release-identity.json', identity]]);
for (const name of [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
]) {
  composeFiles.set(name, await readFile(join(root, name)));
}
for (const directory of [
  'apps/api',
  'apps/web',
  'packages/contracts',
  'packages/database',
  'packages/media',
  'docker',
]) {
  await addTree(
    composeFiles,
    join(root, directory),
    directory,
    (path) =>
      !path.includes(`${sep}node_modules${sep}`) &&
      !path.includes(`${sep}dist${sep}`) &&
      !path.includes(`${sep}coverage${sep}`) &&
      !path.endsWith('.test.ts') &&
      !path.endsWith('.map'),
  );
}

const definitions = [
  { target: 'cloudflare', stem: `apiarylens-${version}-cloudflare`, files: cloudflareFiles },
  { target: 'compose', stem: `apiarylens-${version}-compose`, files: composeFiles },
];

const artifacts = [];
for (const name of await readdir(artifactDirectory)) {
  if (definitions.some((definition) => name.startsWith(definition.stem)))
    await rm(join(artifactDirectory, name), { force: true });
}
for (const definition of definitions) {
  const archive = gzipSync(createTar(definition.files), { level: 9, mtime: 0 });
  const sha256 = createHash('sha256').update(archive).digest('hex');
  const name = `${definition.stem}-${sha256.slice(0, 12)}.tar.gz`;
  const path = join(artifactDirectory, name);
  await writeFile(path, archive, { mode: 0o644 });
  artifacts.push({
    name,
    kind: 'deployment-bundle',
    target: definition.target,
    url: `https://apiarylens.org/releases/${version}/artifacts/${name}`,
    sha256,
    bytes: archive.length,
  });
}

manifest.artifacts = [
  ...artifacts,
  ...manifest.artifacts.filter(
    (artifact) => !['deployment-bundle', 'deployment-tool'].includes(artifact.kind),
  ),
];
await writeFile(manifestPath, await prettier.format(JSON.stringify(manifest), { parser: 'json' }));
console.log(`Built ${artifacts.length} verified deployment bundles for ApiaryLens ${version}.`);

async function buildReleaseInputs() {
  if (!process.env.npm_execpath) {
    throw new Error('Run release artifact assembly through `pnpm release:artifacts`.');
  }
  const pnpm = [process.env.npm_execpath];
  const pnpmOptions = { cwd: root };
  await run(process.execPath, [...pnpm, '--filter', '@apiarylens/contracts', 'build'], pnpmOptions);
  await run(process.execPath, [...pnpm, '--filter', '@apiarylens/worker', 'build'], pnpmOptions);
  await run(process.execPath, [...pnpm, '--filter', '@apiarylens/web', 'build'], {
    ...pnpmOptions,
    env: {
      ...process.env,
      VITE_DEPLOYMENT_PROFILE: 'cloudflare',
      VITE_SOURCE_COMMIT: manifest.sourceCommit,
      VITE_BUILD_TIME: manifest.buildTime,
      VITE_ARTIFACT_IDENTITY: artifactIdentity,
    },
  });
}
