// Load-reproducible image identity for the air-gap bundle (issue #82).
//
// `docker image inspect --format '{{.Id}}'` against the BUILD daemon is not a
// portable image identity: with the containerd image store (the Docker
// Engine 28.x default) the daemon reports the digest of the image's OCI
// manifest/index — including BuildKit provenance attestations that
// `docker save` strips — so no `docker load` of the saved archive can ever
// reproduce that ID on another host. What `docker load` reports as the image
// ID on a pristine host, on both the graphdriver and containerd image stores
// (confirmed on the UAT-001 reference hosts, #78), is the sha256 digest of
// the image's config blob exactly as stored in the archive. That digest is a
// pure function of the archive bytes, so this module derives it directly
// from the `docker save` tar with no daemon involved.

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

// Map every repo:tag in a `docker save` archive to the image ID a
// `docker load` of that archive reproduces: sha256 of the config blob the
// archive's manifest.json references for that image.
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
    const id = `sha256:${createHash('sha256').update(config).digest('hex')}`;
    for (const tag of image.RepoTags ?? []) ids.set(tag, id);
  }
  return ids;
}

// Compare the image IDs a bundle manifest records against the IDs derived
// from the bundle's own images archive. Returns a list of human-readable
// failures; empty means every recorded ID is byte-reproducible by
// `docker load` on any host and image store.
export function verifyBundleImageIdentity(bundleManifest, imagesArchive) {
  const derived = imageIdsFromArchive(imagesArchive);
  const failures = [];
  for (const [label, imageKey, idKey] of [
    ['api', 'apiImage', 'apiImageId'],
    ['web', 'webImage', 'webImageId'],
    ['helper', 'helperImage', 'helperImageId'],
  ]) {
    const image = bundleManifest[imageKey];
    const recorded = bundleManifest[idKey];
    if (!image || !recorded) {
      failures.push(`bundle-manifest.json does not record ${imageKey}/${idKey}`);
      continue;
    }
    const reproducible = derived.get(image);
    if (!reproducible) {
      failures.push(`Image ${image} (${label}) is not present in the images archive`);
    } else if (reproducible !== recorded) {
      failures.push(
        `Image ${image} (${label}): recorded ${idKey} ${recorded}, but every docker load of the images archive reproduces ${reproducible}`,
      );
    }
  }
  return failures;
}
