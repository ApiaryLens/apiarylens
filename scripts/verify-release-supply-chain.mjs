import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const manifest = JSON.parse(
  await readFile(join(releaseDirectory, 'release-manifest.json'), 'utf8'),
);
const releaseKinds = new Set(['sbom', 'license-report', 'provenance']);

for (const artifact of manifest.artifacts) {
  const localPath =
    artifact.target === 'release'
      ? join(releaseDirectory, artifact.name)
      : join(releaseDirectory, 'artifacts', artifact.name);
  const content = await readFile(localPath);
  const metadata = await stat(localPath);
  const digest = createHash('sha256').update(content).digest('hex');
  if (metadata.size !== artifact.bytes || digest !== artifact.sha256)
    throw new Error(`Release artifact identity mismatch: ${artifact.name}`);
}

for (const kind of releaseKinds) {
  if (!manifest.artifacts.some((artifact) => artifact.kind === kind))
    throw new Error(`Release manifest is missing ${kind}`);
}

const sbom = JSON.parse(await readFile(join(releaseDirectory, 'apiarylens-sbom.cdx.json'), 'utf8'));
if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.6' || !Array.isArray(sbom.components))
  throw new Error('CycloneDX SBOM identity is invalid');
const forbidden = /AGPL|SSPL|BUSL|Commons Clause|Noncommercial|UNLICENSED/i;
for (const component of sbom.components) {
  const expression = component.licenses
    ?.map((entry) => entry.expression ?? entry.license?.id ?? entry.license?.name ?? '')
    .join(' AND ');
  if (!expression || forbidden.test(expression))
    throw new Error(
      `Forbidden or missing license for ${component.name}@${component.version}: ${expression}`,
    );
}

const provenance = JSON.parse(
  await readFile(join(releaseDirectory, 'apiarylens-provenance.intoto.jsonl'), 'utf8'),
);
if (
  provenance._type !== 'https://in-toto.io/Statement/v1' ||
  provenance.predicateType !== 'https://slsa.dev/provenance/v1'
)
  throw new Error('Provenance statement identity is invalid');
const expectedSubjects = manifest.artifacts
  .filter((artifact) => ['deployment-bundle', 'deployment-tool'].includes(artifact.kind))
  .map((artifact) => `${artifact.name}:${artifact.sha256}`)
  .sort();
const actualSubjects = provenance.subject
  .map((subject) => `${subject.name}:${subject.digest.sha256}`)
  .sort();
if (JSON.stringify(expectedSubjects) !== JSON.stringify(actualSubjects))
  throw new Error('Provenance subjects do not match released product artifacts');
if (
  manifest.channel === 'stable' &&
  provenance.predicate.buildDefinition.internalParameters.dirtyWorktree
)
  throw new Error('A stable release cannot come from a dirty worktree');

console.log(
  `Supply-chain evidence valid: ${manifest.artifacts.length} artifacts, ${sbom.components.length} components, unsigned provenance structurally verified.`,
);
