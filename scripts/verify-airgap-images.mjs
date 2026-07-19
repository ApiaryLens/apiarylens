// Store-independent air-gap image identity verifier (issue #82).
//
// Recomputes the image IDs a `docker load` of the bundle's images archive
// reproduces — the sha256 of each config blob, derived from the archive
// bytes alone — and compares them with the IDs bundle-manifest.json records.
// No Docker daemon is involved, so this check cannot be fooled by the
// build/CI daemon's own image store the way a post-load `docker image
// inspect` comparison on the build host can (that comparison is what let the
// defective 0.1.0-preview.4 bundle pass CI while failing on every real host).
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

for (const [imageKey, idKey] of [
  ['apiImage', 'apiImageId'],
  ['webImage', 'webImageId'],
  ['helperImage', 'helperImageId'],
]) {
  console.log(`${manifest[imageKey]}: ${idKey} ${manifest[idKey]} reproduced from the archive.`);
}
console.log(`Recorded image IDs for ApiaryLens ${manifest.productVersion} are load-reproducible.`);
