import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import prettier from 'prettier';

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const manifestPath = join(releaseDirectory, 'release-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!process.env.npm_execpath) {
  throw new Error('Run supply-chain assembly through `pnpm release:supply-chain`.');
}
const licenseProcess = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'licenses', 'list', '--json'],
  {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (licenseProcess.status !== 0)
  throw new Error(licenseProcess.stderr || 'License inventory failed');
const licenseGroups = JSON.parse(licenseProcess.stdout);

const packages = new Map();
for (const [license, entries] of Object.entries(licenseGroups)) {
  for (const entry of entries) {
    for (const version of entry.versions) {
      const key = `${entry.name}@${version}`;
      packages.set(key, {
        type: 'library',
        name: entry.name,
        version,
        purl: `pkg:npm/${encodeURIComponent(entry.name).replace('%40', '@')}@${version}`,
        licenses: [license.includes(' ') ? { expression: license } : { license: { id: license } }],
        ...(entry.homepage
          ? { externalReferences: [{ type: 'website', url: entry.homepage }] }
          : {}),
      });
    }
  }
}

const artifactSubjects = manifest.artifacts
  .filter((artifact) => ['deployment-bundle', 'deployment-tool'].includes(artifact.kind))
  .map((artifact) => ({ name: artifact.name, digest: { sha256: artifact.sha256 } }));
const serialSeed = createHash('sha256')
  .update(artifactSubjects.map((subject) => `${subject.name}:${subject.digest.sha256}`).join('\n'))
  .digest('hex');
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${uuidFromHash(serialSeed)}`,
  version: 1,
  metadata: {
    component: { type: 'application', name: 'ApiaryLens', version: manifest.productVersion },
    properties: [
      { name: 'apiarylens:release-channel', value: manifest.channel },
      { name: 'apiarylens:dependency-scope', value: 'installed workspace including build tooling' },
    ],
  },
  components: [...packages.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  ),
};

const licenseCounts = new Map();
for (const component of sbom.components) {
  const id = component.licenses[0].expression ?? component.licenses[0].license.id;
  licenseCounts.set(id, (licenseCounts.get(id) ?? 0) + 1);
}
const licenseReport = `# ApiaryLens Dependency License Report

Release: ${manifest.productVersion}

Generated from the installed pnpm workspace. This inventory includes runtime,
development, build, test, and platform-specific packages; release-bundle composition
must still be reviewed separately.

| Declared license expression | Packages |
|---|---:|
${[...licenseCounts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([license, count]) => `| ${license} | ${count} |`)
  .join('\n')}

No AGPL, SSPL, source-available, noncommercial, or unlicensed dependency was
reported. The Windows sharp/libvips package declares
\`Apache-2.0 AND LGPL-3.0-or-later\`; distribution remains dynamic through the
package's prebuilt runtime and requires preservation of its notices and relinking
rights. This report is evidence, not legal advice.
`;

const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const provenance = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: artifactSubjects,
  predicateType: 'https://slsa.dev/provenance/v1',
  predicate: {
    buildDefinition: {
      buildType: 'https://apiarylens.dev/build-types/local-release-candidate/v1',
      externalParameters: { productVersion: manifest.productVersion, channel: manifest.channel },
      internalParameters: { dirtyWorktree: Boolean(dirty.stdout.trim()) },
      resolvedDependencies: [
        {
          uri: 'git+https://github.com/ApiaryLens/apiarylens',
          digest: { gitCommit: git.stdout.trim() },
        },
      ],
    },
    runDetails: {
      builder: { id: 'https://apiarylens.dev/builders/local-codex-workspace/v1' },
      metadata: { invocationId: randomUUID(), finishedOn: new Date().toISOString() },
    },
  },
};

const generated = [
  ['apiarylens-sbom.cdx.json', `${JSON.stringify(sbom, null, 2)}\n`, 'sbom'],
  ['apiarylens-license-report.md', licenseReport, 'license-report'],
  ['apiarylens-provenance.intoto.jsonl', `${JSON.stringify(provenance)}\n`, 'provenance'],
];
const generatedArtifacts = [];
for (const [name, content, kind] of generated) {
  const path = join(releaseDirectory, name);
  await writeFile(path, content);
  const bytes = Buffer.byteLength(content);
  generatedArtifacts.push({
    name,
    kind,
    target: 'release',
    url: `https://apiarylens.org/releases/${manifest.productVersion}/${name}`,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes,
  });
}
manifest.artifacts = [
  ...manifest.artifacts.filter(
    (artifact) => !generatedArtifacts.some((item) => item.kind === artifact.kind),
  ),
  ...generatedArtifacts,
];
await writeFile(manifestPath, await prettier.format(JSON.stringify(manifest), { parser: 'json' }));
console.log(
  `Generated SBOM, license report, and unsigned provenance for ${artifactSubjects.length} release artifacts.`,
);

function uuidFromHash(hash) {
  const value = hash.slice(0, 32).split('');
  value[12] = '4';
  value[16] = ((Number.parseInt(value[16], 16) & 0x3) | 0x8).toString(16);
  return `${value.slice(0, 8).join('')}-${value.slice(8, 12).join('')}-${value.slice(12, 16).join('')}-${value.slice(16, 20).join('')}-${value.slice(20).join('')}`;
}
