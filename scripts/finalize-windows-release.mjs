import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function createWindowsSigningEvidence({
  productVersion,
  sourceCommit,
  releaseCommit,
  exactTag,
  signingMode,
  explicitUnsignedPreviewOptIn,
  signature,
  subjects,
}) {
  const preview = productVersion.includes('-preview.');
  if (
    exactTag !== `v${productVersion}` ||
    !/^[0-9a-f]{40}$/.test(sourceCommit) ||
    !/^[0-9a-f]{40}$/.test(releaseCommit)
  ) {
    throw new Error(
      'Windows signing evidence requires exact product, source, release, and tag identities.',
    );
  }
  if (!['signed', 'unsigned-preview'].includes(signingMode))
    throw new Error(`Unsupported Windows signing mode: ${signingMode || '<missing>'}.`);
  if (
    signingMode === 'unsigned-preview' &&
    (!preview ||
      !explicitUnsignedPreviewOptIn ||
      !subjects.some((item) => item.name.includes('-UNSIGNED-PREVIEW.exe')))
  ) {
    throw new Error(
      'Unsigned Windows evidence requires an explicit Preview opt-in and visible filename suffix.',
    );
  }
  if (signingMode === 'signed' && (!signature?.publisher || !signature?.thumbprint))
    throw new Error('Signed Windows evidence requires the verified Authenticode identity.');
  return {
    schemaVersion: 1,
    product: 'ApiaryLens for Windows',
    productVersion,
    sourceCommit,
    releaseCommit,
    exactTag,
    signingMode,
    explicitUnsignedPreviewOptIn,
    authenticode:
      signingMode === 'signed'
        ? { status: 'signed', ...signature, digest: 'SHA256', timestamped: true }
        : {
            status: 'unsigned',
            reason: 'preview-explicit-opt-in-signing-secrets-unavailable',
          },
    subjects,
  };
}

export function createWindowsProductArtifacts(productVersion, packageBytes, subjects) {
  const baseUrl = `https://apiarylens.org/releases/${productVersion}/artifacts/windows`;
  return [
    {
      name: 'windows-package.json',
      kind: 'windows-package-manifest',
      target: 'windows-x64',
      url: `${baseUrl}/windows-package.json`,
      sha256: sha256(packageBytes),
      bytes: packageBytes.length,
    },
    ...subjects.map((subject) => ({
      ...subject,
      kind: 'windows-package-artifact',
      target: 'windows-x64',
      url: `${baseUrl}/${subject.name}`,
    })),
  ];
}

function run() {
  const root = resolve(import.meta.dirname, '..');
  const windowsRoot = join(root, 'release', 'artifacts', 'windows');
  const artifactsRoot = join(windowsRoot, 'artifacts');
  const packageManifestPath = join(windowsRoot, 'windows-package.json');
  const productManifestPath = join(root, 'release', 'release-manifest.json');
  const packageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'));
  const productManifest = JSON.parse(readFileSync(productManifestPath, 'utf8'));
  const signingMode = process.env.APIARYLENS_WINDOWS_SIGNING_MODE;
  const exactTag = process.env.APIARYLENS_EXACT_TAG;
  const releaseCommit = process.env.GITHUB_SHA;
  const sourceCommit = productManifest.sourceCommit;
  const explicitUnsignedPreviewOptIn =
    process.env.APIARYLENS_EXPLICIT_UNSIGNED_PREVIEW_OPT_IN === 'true';
  if (
    exactTag !== `v${packageManifest.productVersion}` ||
    !/^[0-9a-f]{40}$/.test(releaseCommit) ||
    sourceCommit !== packageManifest.sourceCommit ||
    productManifest.productVersion !== packageManifest.productVersion ||
    !/^[0-9a-f]{40}$/.test(sourceCommit)
  ) {
    throw new Error('Windows release identity does not match the exact product tag and revision.');
  }
  if (signingMode === 'unsigned-preview') {
    const setup = packageManifest.artifacts.find((item) => item.name === 'ApiaryLensSetup.exe');
    if (!setup) throw new Error('Unsigned Preview packaging could not find ApiaryLensSetup.exe.');
    const renamed = 'ApiaryLensSetup-UNSIGNED-PREVIEW.exe';
    renameSync(join(artifactsRoot, setup.name), join(artifactsRoot, renamed));
    setup.name = renamed;
  }
  const subjects = packageManifest.artifacts.map((record) => {
    const path = join(artifactsRoot, record.name);
    if (!existsSync(path)) throw new Error(`Missing Windows release subject ${record.name}.`);
    const bytes = readFileSync(path);
    const actual = { name: basename(path), bytes: statSync(path).size, sha256: sha256(bytes) };
    if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256)
      throw new Error(`Windows release subject identity changed: ${record.name}.`);
    return actual;
  });
  packageManifest.signed = signingMode === 'signed';
  if (signingMode !== 'signed') delete packageManifest.signature;
  const packageBytes = Buffer.from(`${JSON.stringify(packageManifest, null, 2)}\n`);
  writeFileSync(packageManifestPath, packageBytes);
  productManifest.artifacts = [
    ...productManifest.artifacts.filter((artifact) => artifact.target !== 'windows-x64'),
    ...createWindowsProductArtifacts(packageManifest.productVersion, packageBytes, subjects),
  ];
  writeFileSync(productManifestPath, `${JSON.stringify(productManifest, null, 2)}\n`);
  const evidence = createWindowsSigningEvidence({
    productVersion: packageManifest.productVersion,
    sourceCommit,
    releaseCommit,
    exactTag,
    signingMode,
    explicitUnsignedPreviewOptIn,
    signature: packageManifest.signature,
    subjects,
  });
  writeFileSync(
    join(root, 'release', 'apiarylens-windows-signing.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
