// Reproducible-build verification (SEC-001 / WIN-031, plan v2 P1-4).
//
// Builds the release deployment bundles twice from the same source and fails
// unless both runs produce byte-identical artifacts (identical SHA-256 and
// sizes). This is the CI-runnable check demanded by the SEC-001 Defender
// investigation: a clean rebuild must be comparable byte-for-byte against a
// released artifact, so the build itself must first be proven deterministic.
//
// Determinism contract (why full-hash equality is expected, no normalization):
// - `sourceCommit` and `buildTime` are read from the committed
//   release/release-manifest.json, never from the clock.
// - The tar writer in build-release-artifacts.mjs zeroes mtime, uid, and gid
//   and sorts entries; gzip runs with `mtime: 0`.
// - Worker and web builds receive their identity via fixed VITE_* inputs.
//
// Scope: the cloudflare and compose deployment bundles (kind
// "deployment-bundle"). The Windows Squirrel package built by
// build-windows-package.mjs is intentionally NOT hash-compared here: nupkg/zip
// container timestamps and Authenticode signing make byte-identity impossible
// without a normalized PE/zip comparison; that comparison is performed
// per-release during the SEC-001 provenance procedure instead
// (pmo evidence, apiarylens-ops).

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const root = resolve(import.meta.dirname, '..');
const artifactDirectory = join(root, 'release', 'artifacts');
const manifestPath = join(root, 'release', 'release-manifest.json');

if (!process.env.npm_execpath) {
  throw new Error('Run the reproducibility check through `pnpm release:reproducible`.');
}

const originalManifest = await readFile(manifestPath);
const committedVersion = JSON.parse(originalManifest.toString('utf8')).productVersion;
const bundleStems = ['cloudflare', 'compose'].map(
  (target) => `apiarylens-${committedVersion}-${target}`,
);
const originalBundles = new Map();
for (const name of await readdir(artifactDirectory)) {
  if (bundleStems.some((stem) => name.startsWith(stem)))
    originalBundles.set(name, await readFile(join(artifactDirectory, name)));
}

async function buildOnce(label) {
  await run(process.execPath, [process.env.npm_execpath, 'release:artifacts'], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bundles = manifest.artifacts.filter((artifact) => artifact.kind === 'deployment-bundle');
  if (bundles.length === 0) throw new Error(`${label}: no deployment bundles were produced`);
  const results = [];
  const present = await readdir(artifactDirectory);
  for (const bundle of bundles.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!present.includes(bundle.name))
      throw new Error(`${label}: manifest names ${bundle.name} but the file was not written`);
    const bytes = await readFile(join(artifactDirectory, bundle.name));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== bundle.sha256)
      throw new Error(
        `${label}: ${bundle.name} on disk (${sha256}) does not match its manifest entry (${bundle.sha256})`,
      );
    results.push({ name: bundle.name, target: bundle.target, sha256, bytes: bytes.length });
  }
  return results;
}

try {
  const first = await buildOnce('build 1');
  const second = await buildOnce('build 2');
  if (first.length !== second.length)
    throw new Error(
      `Build runs produced different artifact counts: ${first.length} then ${second.length}`,
    );
  const failures = [];
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index];
    const b = second[index];
    if (a.name !== b.name || a.sha256 !== b.sha256 || a.bytes !== b.bytes)
      failures.push(
        `  ${a.name} (${a.sha256}, ${a.bytes} bytes) != ${b.name} (${b.sha256}, ${b.bytes} bytes)`,
      );
  }
  if (failures.length > 0)
    throw new Error(
      `Release build is not reproducible; two builds from identical source differ:\n${failures.join('\n')}`,
    );
  for (const artifact of first)
    console.log(`reproducible ${artifact.target}: ${artifact.name} sha256=${artifact.sha256}`);
  console.log(
    `Reproducible-build check passed: ${first.length} deployment bundles are byte-identical across two builds.`,
  );
} finally {
  // Leave the working tree as it was: the check must not rewrite the
  // committed release manifest or the committed release-evidence bundles
  // with locally rebuilt artifacts.
  for (const name of await readdir(artifactDirectory)) {
    if (bundleStems.some((stem) => name.startsWith(stem)) && !originalBundles.has(name))
      await rm(join(artifactDirectory, name), { force: true });
  }
  for (const [name, bytes] of originalBundles)
    await writeFile(join(artifactDirectory, name), bytes);
  await writeFile(manifestPath, originalManifest);
}
