// Load-reproducible image identity for the air-gap bundle (issues #82, #91).
//
// `docker image inspect --format '{{.Id}}'` against the BUILD daemon is not a
// portable image identity: with the containerd image store (the Docker
// Engine 28.x default) the daemon reports the digest of the image's OCI
// manifest/index — including BuildKit provenance attestations that
// `docker save` strips — so no `docker load` of the saved archive can ever
// reproduce that ID on another host (issue #82).
//
// What a pristine host reports after `docker load` of the saved archive is
// image-store-dependent (issue #91, verified on the UAT-001 reference host):
//
//   classic graphdriver store  `.Id` = sha256 of the image's CONFIG blob
//                              exactly as stored in the archive;
//   containerd image store     `.Id` = the image's OCI MANIFEST digest
//                              exactly as recorded in the archive's
//                              index.json (the default on current Docker
//                              Engine, e.g. 29.x).
//
// Both digests are pure functions of the archive bytes, so this module
// derives BOTH directly from the `docker save` tar with no daemon involved;
// the bundle records both, and the post-load gate accepts either.

import { createHash } from 'node:crypto';

const BLOCK = 512;

function trimField(buffer) {
  let end = buffer.indexOf(0);
  if (end === -1) end = buffer.length;
  return buffer.subarray(0, end).toString('utf8').trim();
}

function parseSize(field) {
  // Base-256 (leading bit set) for entries over the octal limit; octal with
  // trailing NUL/space padding otherwise.
  if (field[0] & 0x80) {
    let value = field[0] & 0x7f;
    for (let index = 1; index < field.length; index += 1) value = value * 256 + field[index];
    return value;
  }
  const text = trimField(field);
  return text === '' ? 0 : Number.parseInt(text, 8);
}

function parsePaxRecords(content) {
  // "<decimal length> <key>=<value>\n" records; length counts the whole record.
  const overrides = {};
  let offset = 0;
  while (offset < content.length) {
    const space = content.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(content.subarray(offset, space).toString('ascii'), 10);
    if (!Number.isInteger(length) || length <= 0) break;
    const record = content.subarray(space + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals !== -1) overrides[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return overrides;
}

// Iterate the regular-file members of a tar archive as { name, content }
// views into the source buffer. Handles ustar name prefixes, pax extended
// headers (path/size overrides), and GNU long names — everything Go's
// archive/tar (which writes `docker save` output) emits.
export function* tarEntries(archive) {
  let offset = 0;
  let pax = null;
  let longName = null;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const typeflag = String.fromCharCode(header[156]);
    let size = parseSize(header.subarray(124, 136));
    let name = trimField(header.subarray(0, 100));
    const prefix = trimField(header.subarray(345, 500));
    if (prefix) name = `${prefix}/${name}`;
    if (typeflag === 'x' || typeflag === 'L' || typeflag === 'g') {
      const meta = archive.subarray(offset + BLOCK, offset + BLOCK + size);
      if (typeflag === 'x') pax = parsePaxRecords(meta);
      else if (typeflag === 'L') longName = trimField(meta);
      offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
      continue;
    }
    if (pax?.path !== undefined) name = pax.path;
    else if (longName !== null) name = longName;
    if (pax?.size !== undefined) size = Number.parseInt(pax.size, 10);
    const content = archive.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    pax = null;
    longName = null;
    if (typeflag === '0' || typeflag === '\0') yield { name, content };
  }
}

const sha256Of = (content) => `sha256:${createHash('sha256').update(content).digest('hex')}`;

// Every config-blob digest reachable beneath one OCI descriptor: an image
// manifest contributes its config digest; a nested index contributes every
// config digest beneath each of its child manifests. The blob bytes are
// re-hashed and must match the descriptor digest, so a tampered or
// inconsistent archive fails here instead of producing a wrong identity.
function configDigestsUnderDescriptor(members, descriptor, seen = new Set()) {
  const digest = descriptor.digest;
  if (typeof digest !== 'string' || !digest.startsWith('sha256:')) {
    throw new Error(`The archive's OCI index contains an unsupported digest: ${digest}`);
  }
  if (seen.has(digest)) return [];
  seen.add(digest);
  const blob = members.get(`blobs/sha256/${digest.slice('sha256:'.length)}`);
  if (!blob) {
    throw new Error(`The image archive references a missing OCI blob: ${digest}`);
  }
  if (sha256Of(blob) !== digest) {
    throw new Error(`The image archive's OCI blob does not match its recorded digest: ${digest}`);
  }
  const parsed = JSON.parse(blob.toString('utf8'));
  if (parsed.config?.digest) return [parsed.config.digest];
  if (Array.isArray(parsed.manifests)) {
    return parsed.manifests.flatMap((child) => configDigestsUnderDescriptor(members, child, seen));
  }
  throw new Error(`The image archive's OCI blob is neither a manifest nor an index: ${digest}`);
}

// Map every repo:tag in a `docker save` archive to BOTH image IDs a
// `docker load` of that archive can reproduce, depending on the target
// host's image store:
//   id             sha256 of the config blob the archive's manifest.json
//                  references (classic graphdriver store `.Id`);
//   manifestDigest the OCI manifest digest the archive's index.json records
//                  for that image (containerd image store `.Id`).
export function imageIdentitiesFromArchive(archive) {
  const members = new Map();
  for (const entry of tarEntries(archive)) members.set(entry.name, entry.content);
  const manifest = members.get('manifest.json');
  if (!manifest) {
    throw new Error('The image archive has no manifest.json; it is not a `docker save` archive');
  }
  const index = members.get('index.json');
  if (!index) {
    throw new Error(
      'The image archive has no OCI index.json, so the containerd-store image identity ' +
        'cannot be derived; save the images with a Docker Engine that writes the OCI ' +
        'layout (25.0 or newer)',
    );
  }
  // Join the two archive views on the config digest: index.json descriptor
  // digests are annotation-independent, and every docker save image has
  // exactly one manifest per config.
  const manifestDigestByConfig = new Map();
  for (const descriptor of JSON.parse(index.toString('utf8')).manifests ?? []) {
    for (const configDigest of configDigestsUnderDescriptor(members, descriptor)) {
      const existing = manifestDigestByConfig.get(configDigest);
      if (existing !== undefined && existing !== descriptor.digest) {
        throw new Error(
          `The image archive's OCI index is ambiguous: config ${configDigest} is reachable ` +
            `from both ${existing} and ${descriptor.digest}`,
        );
      }
      manifestDigestByConfig.set(configDigest, descriptor.digest);
    }
  }
  const identities = new Map();
  for (const image of JSON.parse(manifest.toString('utf8'))) {
    const config = members.get(image.Config);
    if (!config) {
      throw new Error(`The image archive references a missing config member: ${image.Config}`);
    }
    const id = sha256Of(config);
    const manifestDigest = manifestDigestByConfig.get(id);
    if (!manifestDigest) {
      throw new Error(
        `The image archive's OCI index does not cover the image with config ${id} ` +
          `(tags: ${(image.RepoTags ?? []).join(', ') || 'none'})`,
      );
    }
    for (const tag of image.RepoTags ?? []) identities.set(tag, { id, manifestDigest });
  }
  return identities;
}

// Backward-compatible view: repo:tag -> classic-store image ID (config-blob
// digest) only. Works on archives without an OCI index; use
// imageIdentitiesFromArchive wherever the containerd-store identity matters.
export function imageIdsFromArchive(archive) {
  const members = new Map();
  for (const entry of tarEntries(archive)) members.set(entry.name, entry.content);
  const manifest = members.get('manifest.json');
  if (!manifest) {
    throw new Error('The image archive has no manifest.json; it is not a `docker save` archive');
  }
  const ids = new Map();
  for (const image of JSON.parse(manifest.toString('utf8'))) {
    const config = members.get(image.Config);
    if (!config) {
      throw new Error(`The image archive references a missing config member: ${image.Config}`);
    }
    const id = sha256Of(config);
    for (const tag of image.RepoTags ?? []) ids.set(tag, id);
  }
  return ids;
}

// Compare BOTH identities a bundle manifest records — the config digest
// (classic graphdriver `.Id`) and the OCI manifest digest (containerd-store
// `.Id`) — against the identities derived from the bundle's own images
// archive. Returns a list of human-readable failures; empty means both
// recorded identities are byte-reproducible by `docker load` on any host,
// whichever image store it runs (issue #91).
export function verifyBundleImageIdentity(bundleManifest, imagesArchive) {
  const derived = imageIdentitiesFromArchive(imagesArchive);
  const failures = [];
  for (const [label, imageKey, idKey, digestKey] of [
    ['api', 'apiImage', 'apiImageId', 'apiImageManifestDigest'],
    ['web', 'webImage', 'webImageId', 'webImageManifestDigest'],
    ['helper', 'helperImage', 'helperImageId', 'helperImageManifestDigest'],
  ]) {
    const image = bundleManifest[imageKey];
    const recorded = bundleManifest[idKey];
    const recordedManifestDigest = bundleManifest[digestKey];
    if (!image || !recorded) {
      failures.push(`bundle-manifest.json does not record ${imageKey}/${idKey}`);
      continue;
    }
    if (!recordedManifestDigest) {
      failures.push(
        `bundle-manifest.json does not record ${digestKey} (the containerd image-store identity); the post-load gate would refuse this bundle on current Docker defaults`,
      );
      continue;
    }
    const reproducible = derived.get(image);
    if (!reproducible) {
      failures.push(`Image ${image} (${label}) is not present in the images archive`);
      continue;
    }
    if (reproducible.id !== recorded) {
      failures.push(
        `Image ${image} (${label}): recorded ${idKey} ${recorded}, but every docker load of the images archive reproduces ${reproducible.id}`,
      );
    }
    if (reproducible.manifestDigest !== recordedManifestDigest) {
      failures.push(
        `Image ${image} (${label}): recorded ${digestKey} ${recordedManifestDigest}, but the archive's OCI index records ${reproducible.manifestDigest}`,
      );
    }
  }
  return failures;
}
