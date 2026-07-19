import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDirectory = join(root, 'release');
const manifest = JSON.parse(
  await readFile(join(releaseDirectory, 'release-manifest.json'), 'utf8'),
);
const releaseKinds = new Set(['sbom', 'license-report', 'provenance']);
let remotelyPinnedArtifacts = 0;

// Artifacts too large to live in git (Windows installers, the air-gap tar)
// are allowed to be absent locally only when the manifest pins them to their
// canonical immutable release URL; their bytes are still verified in the
// release workflow before publication and by SHA256SUMS + attestation after.
function isRemotelyPinned(artifact) {
  if (
    artifact.target === 'windows-x64' &&
    artifact.kind === 'windows-package-artifact' &&
    artifact.url ===
      `https://apiarylens.org/releases/${manifest.productVersion}/artifacts/windows/${artifact.name}`
  )
    return true;
  return (
    artifact.target === 'airgap' &&
    artifact.kind === 'deployment-bundle' &&
    artifact.url ===
      `https://apiarylens.org/releases/${manifest.productVersion}/artifacts/${artifact.name}`
  );
}

for (const artifact of manifest.artifacts) {
  const localPath =
    artifact.target === 'release'
      ? join(releaseDirectory, artifact.name)
      : artifact.kind === 'windows-package-manifest'
        ? join(releaseDirectory, 'artifacts', 'windows', artifact.name)
        : artifact.target === 'windows-x64'
          ? join(releaseDirectory, 'artifacts', 'windows', 'artifacts', artifact.name)
          : join(releaseDirectory, 'artifacts', artifact.name);
  let content;
  let metadata;
  try {
    content = await readFile(localPath);
    metadata = await stat(localPath);
  } catch (error) {
    if (error?.code === 'ENOENT' && isRemotelyPinned(artifact)) {
      remotelyPinnedArtifacts += 1;
      continue;
    }
    throw error;
  }
  const digest = createHash('sha256').update(content).digest('hex');
  if (metadata.size !== artifact.bytes || digest !== artifact.sha256)
    throw new Error(`Release artifact identity mismatch: ${artifact.name}`);
}

const productWindowsArtifacts = manifest.artifacts
  .filter((artifact) => artifact.kind === 'windows-package-artifact')
  .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }))
  .sort((left, right) => left.name.localeCompare(right.name));
if (productWindowsArtifacts.length > 0) {
  const windowsPackage = JSON.parse(
    await readFile(join(releaseDirectory, 'artifacts', 'windows', 'windows-package.json'), 'utf8'),
  );
  const packageWindowsArtifacts = windowsPackage.artifacts
    .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (
    windowsPackage.productVersion !== manifest.productVersion ||
    windowsPackage.sourceCommit !== manifest.sourceCommit ||
    JSON.stringify(productWindowsArtifacts) !== JSON.stringify(packageWindowsArtifacts)
  )
    throw new Error('Windows package manifest does not match the product release manifest');
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
// Issue #92: the manifest's claimed source identity and the provenance's
// actual build source must be the same commit — preview.5 shipped with
// manifest.sourceCommit 1f348e0 while its provenance (and bytes) recorded
// 8c43e5f, and nothing verified the two against each other. And a
// publishable artifact set can never come from a dirty tree: dirty bytes are
// pinned by no commit, so the claimed identity is unreproducible regardless
// of channel.
const provenanceCommit =
  provenance.predicate.buildDefinition.resolvedDependencies?.[0]?.digest?.gitCommit;
if (provenanceCommit !== manifest.sourceCommit)
  throw new Error(
    `Release identity binding is broken: release-manifest.json claims sourceCommit ` +
      `${manifest.sourceCommit} but the provenance records gitCommit ${provenanceCommit}`,
  );
if (provenance.predicate.buildDefinition.internalParameters.dirtyWorktree)
  throw new Error('Release evidence comes from a dirty worktree; publishable builds must be clean');

console.log(
  `Supply-chain evidence valid: ${manifest.artifacts.length} artifacts (${remotelyPinnedArtifacts} remotely pinned subjects), ${sbom.components.length} components, unsigned provenance structurally verified.`,
);
