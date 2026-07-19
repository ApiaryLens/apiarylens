// Store-independent air-gap image identity verifier (issues #82, #91).
//
// Recomputes BOTH image identities a `docker load` of the bundle's images
// archive reproduces — the config-blob digest (classic graphdriver `.Id`)
// and the OCI manifest digest (containerd-store `.Id`) — from the archive
// bytes alone, and compares them with the identities bundle-manifest.json
// records. No Docker daemon is involved, so this check cannot be fooled by
// the build/CI daemon's own image store the way a post-load `docker image
// inspect` comparison on the build host can (that comparison is what let the
// defective 0.1.0-preview.4 bundle pass CI while failing on every real host,
// and a config-digest-only recording is what let 0.1.0-preview.5 fail on
// every containerd-store host).
//
// Usage:
//   node scripts/verify-airgap-images.mjs --bundle-dir DIR   extracted bundle
//   node scripts/verify-airgap-images.mjs --bundle FILE.tar  packed bundle
//
// Exit codes match the lifecycle scripts: 64 usage, 65 identity refusal.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tarEntries, verifyBundleImageIdentity } from './airgap-image-identity.mjs';

const usage = () => {
  console.error(
    'Usage: node scripts/verify-airgap-images.mjs (--bundle-dir DIR | --bundle FILE.tar)',
  );
  process.exit(64);
};

const [mode, path, ...rest] = process.argv.slice(2);
if (rest.length > 0 || !path) usage();

let manifest;
let imagesArchive;
if (mode === '--bundle-dir') {
  manifest = JSON.parse(await readFile(join(path, 'bundle-manifest.json'), 'utf8'));
  imagesArchive = await readFile(join(path, manifest.imagesArchive));
} else if (mode === '--bundle') {
  const members = new Map();
  for (const entry of tarEntries(await readFile(path))) members.set(entry.name, entry.content);
  const manifestMember = members.get('bundle-manifest.json');
  if (!manifestMember) {
    console.error(`ERROR: ${path} has no bundle-manifest.json; it is not an air-gap bundle`);
    process.exit(65);
  }
  manifest = JSON.parse(manifestMember.toString('utf8'));
  imagesArchive = members.get(manifest.imagesArchive);
  if (!imagesArchive) {
    console.error(`ERROR: ${path} is missing its images archive ${manifest.imagesArchive}`);
    process.exit(65);
  }
} else {
  usage();
}

const failures = verifyBundleImageIdentity(manifest, imagesArchive);
if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  console.error(
    'The recorded image identity is not reproducible by `docker load` on a pristine host; ' +
      'the shipped verify-bundle.sh --post-load gate would refuse this bundle everywhere.',
  );
  process.exit(65);
}

for (const [imageKey, idKey, digestKey] of [
  ['apiImage', 'apiImageId', 'apiImageManifestDigest'],
  ['webImage', 'webImageId', 'webImageManifestDigest'],
  ['helperImage', 'helperImageId', 'helperImageManifestDigest'],
]) {
  console.log(
    `${manifest[imageKey]}: ${idKey} ${manifest[idKey]} and ${digestKey} ${manifest[digestKey]} reproduced from the archive.`,
  );
}
console.log(
  `Recorded image identities for ApiaryLens ${manifest.productVersion} are load-reproducible on both image stores.`,
);
