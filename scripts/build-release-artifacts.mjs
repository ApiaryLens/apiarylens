import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import prettier from 'prettier';

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const artifactDirectory = join(releaseDirectory, 'artifacts');
const manifestPath = join(releaseDirectory, 'release-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const version = manifest.productVersion;

await mkdir(artifactDirectory, { recursive: true });

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
  ['worker/index.js', await readFile(join(root, 'apps/worker/dist/index.js'))],
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

const deploymentTools = [];
for (const artifact of manifest.artifacts.filter((item) => item.kind === 'deployment-tool')) {
  const content = await readFile(join(artifactDirectory, artifact.name));
  deploymentTools.push({
    ...artifact,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: content.length,
  });
}

manifest.artifacts = [
  ...artifacts,
  ...deploymentTools,
  ...manifest.artifacts.filter(
    (artifact) => !['deployment-bundle', 'deployment-tool'].includes(artifact.kind),
  ),
];
await writeFile(manifestPath, await prettier.format(JSON.stringify(manifest), { parser: 'json' }));
console.log(`Built ${artifacts.length} verified deployment bundles for ApiaryLens ${version}.`);

async function addTree(files, source, prefix, include = () => true) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(source, entry.name);
    if (!include(path)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Release bundles refuse symbolic link: ${path}`);
    if (entry.isDirectory()) await addTree(files, path, `${prefix}/${entry.name}`, include);
    else if (entry.isFile())
      files.set(`${prefix}/${entry.name}`.replaceAll('\\', '/'), await readFile(path));
  }
}

function createTar(files) {
  const chunks = [];
  for (const [name, content] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (Buffer.byteLength(name) > 100) throw new Error(`Tar path is too long: ${name}`);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    octal(header, 100, 8, 0o644);
    octal(header, 108, 8, 0);
    octal(header, 116, 8, 0);
    octal(header, 124, 12, content.length);
    octal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write('apiarylens', 265, 10, 'ascii');
    header.write('apiarylens', 297, 10, 'ascii');
    const checksum = header.reduce((sum, value) => sum + value, 0);
    const checksumText = checksum.toString(8).padStart(6, '0');
    header.write(checksumText, 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 0x20;
    chunks.push(header, content);
    const remainder = content.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function octal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}
