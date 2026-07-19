// Unit coverage for the load-reproducible air-gap image identity (issues
// #82, #91): the recorded identities must be a pure function of the saved
// images archive — the sha256 of each config blob (what the classic
// graphdriver store reports as `.Id` after `docker load`) AND the OCI
// manifest digest from the archive's index.json (what the containerd image
// store, the current Docker default, reports as `.Id`) — because the build
// daemon's `docker image inspect` ID is store-specific and is not preserved
// by `docker save`.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  imageIdentitiesFromArchive,
  imageIdsFromArchive,
  tarEntries,
  verifyBundleImageIdentity,
} from './airgap-image-identity.mjs';
import { createTar } from './release-archive.mjs';

const sha256 = (content) => `sha256:${createHash('sha256').update(content).digest('hex')}`;
const blobPath = (content) => `blobs/sha256/${createHash('sha256').update(content).digest('hex')}`;

const apiConfig = Buffer.from('{"architecture":"amd64","os":"linux","config":{"User":"api"}}');
const webConfig = Buffer.from('{"architecture":"amd64","os":"linux","config":{"User":"web"}}');
const helperConfig = Buffer.from('{"architecture":"amd64","os":"linux"}');

// Minimal OCI image manifest for a config blob, exactly the shape docker
// save writes into blobs/sha256/ and references from index.json.
const ociManifestFor = (config) =>
  Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: {
        mediaType: 'application/vnd.oci.image.config.v1+json',
        digest: sha256(config),
        size: config.length,
      },
      layers: [],
    }),
  );

const apiManifest = ociManifestFor(apiConfig);
const webManifest = ociManifestFor(webConfig);
const helperManifest = ociManifestFor(helperConfig);

function indexFor(manifests) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      manifests: manifests.map((blob) => ({
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: sha256(blob),
        size: blob.length,
      })),
    }),
  );
}

function saveArchive({ manifest, members, index }) {
  const files = new Map(members);
  if (manifest !== null) files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  if (index) files.set('index.json', index);
  return createTar(files);
}

function productArchive() {
  return saveArchive({
    manifest: [
      {
        Config: blobPath(apiConfig),
        RepoTags: ['apiarylens-api:0.1.0-preview.4'],
        Layers: [],
      },
      {
        Config: blobPath(webConfig),
        RepoTags: ['apiarylens-web:0.1.0-preview.4'],
        Layers: [],
      },
      { Config: blobPath(helperConfig), RepoTags: ['alpine:3.22'], Layers: [] },
    ],
    members: [
      [blobPath(apiConfig), apiConfig],
      [blobPath(webConfig), webConfig],
      [blobPath(helperConfig), helperConfig],
      [blobPath(apiManifest), apiManifest],
      [blobPath(webManifest), webManifest],
      [blobPath(helperManifest), helperManifest],
    ],
    index: indexFor([apiManifest, webManifest, helperManifest]),
  });
}

function bundleManifestFor(overrides = {}) {
  return {
    apiImage: 'apiarylens-api:0.1.0-preview.4',
    apiImageId: sha256(apiConfig),
    apiImageManifestDigest: sha256(apiManifest),
    webImage: 'apiarylens-web:0.1.0-preview.4',
    webImageId: sha256(webConfig),
    webImageManifestDigest: sha256(webManifest),
    helperImage: 'alpine:3.22',
    helperImageId: sha256(helperConfig),
    helperImageManifestDigest: sha256(helperManifest),
    ...overrides,
  };
}

// Raw tar entry writer for the metadata records createTar never emits (pax
// extended headers, GNU long names), so the parser is proven against the
// shapes Go's archive/tar can produce in `docker save` output.
function rawEntry(name, typeflag, content) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = typeflag.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const padding =
    content.length % 512 ? Buffer.alloc(512 - (content.length % 512)) : Buffer.alloc(0);
  return Buffer.concat([header, content, padding]);
}

describe('imageIdsFromArchive', () => {
  it('maps every repo tag to the sha256 of its config blob', () => {
    const ids = imageIdsFromArchive(productArchive());
    expect(ids.get('apiarylens-api:0.1.0-preview.4')).toBe(sha256(apiConfig));
    expect(ids.get('apiarylens-web:0.1.0-preview.4')).toBe(sha256(webConfig));
    expect(ids.get('alpine:3.22')).toBe(sha256(helperConfig));
  });

  it('supports the legacy <id>.json config naming and multiple tags per image', () => {
    const hex = createHash('sha256').update(apiConfig).digest('hex');
    const ids = imageIdsFromArchive(
      saveArchive({
        manifest: [
          { Config: `${hex}.json`, RepoTags: ['apiarylens-api:latest', 'apiarylens-api:0.1.0'] },
        ],
        members: [[`${hex}.json`, apiConfig]],
      }),
    );
    expect(ids.get('apiarylens-api:latest')).toBe(sha256(apiConfig));
    expect(ids.get('apiarylens-api:0.1.0')).toBe(sha256(apiConfig));
  });

  it('skips manifest entries without repo tags', () => {
    const ids = imageIdsFromArchive(
      saveArchive({
        manifest: [{ Config: 'blobs/sha256/aaaa', RepoTags: null }],
        members: [['blobs/sha256/aaaa', apiConfig]],
      }),
    );
    expect(ids.size).toBe(0);
  });

  it('rejects an archive without manifest.json', () => {
    expect(() =>
      imageIdsFromArchive(saveArchive({ manifest: null, members: [['oci-layout', apiConfig]] })),
    ).toThrow(/not a `docker save` archive/);
  });

  it('rejects a manifest that references a missing config member', () => {
    expect(() =>
      imageIdsFromArchive(
        saveArchive({
          manifest: [{ Config: 'blobs/sha256/missing', RepoTags: ['apiarylens-api:x'] }],
          members: [],
        }),
      ),
    ).toThrow(/missing config member/);
  });
});

describe('imageIdentitiesFromArchive (both image-store identities, issue #91)', () => {
  it('maps every repo tag to both the config digest and the OCI manifest digest', () => {
    const identities = imageIdentitiesFromArchive(productArchive());
    expect(identities.get('apiarylens-api:0.1.0-preview.4')).toEqual({
      id: sha256(apiConfig),
      manifestDigest: sha256(apiManifest),
    });
    expect(identities.get('apiarylens-web:0.1.0-preview.4')).toEqual({
      id: sha256(webConfig),
      manifestDigest: sha256(webManifest),
    });
    expect(identities.get('alpine:3.22')).toEqual({
      id: sha256(helperConfig),
      manifestDigest: sha256(helperManifest),
    });
  });

  it('resolves a nested index to the top-level descriptor digest (what containerd reports)', () => {
    // A top-level index entry can itself be an index; `.Id` on the containerd
    // store is the digest of the TOP-LEVEL entry, so the config beneath the
    // nested index must map to the outer digest.
    const nestedIndex = indexFor([apiManifest]);
    const archive = saveArchive({
      manifest: [{ Config: blobPath(apiConfig), RepoTags: ['apiarylens-api:nested'], Layers: [] }],
      members: [
        [blobPath(apiConfig), apiConfig],
        [blobPath(apiManifest), apiManifest],
        [blobPath(nestedIndex), nestedIndex],
      ],
      index: indexFor([nestedIndex]),
    });
    expect(imageIdentitiesFromArchive(archive).get('apiarylens-api:nested')).toEqual({
      id: sha256(apiConfig),
      manifestDigest: sha256(nestedIndex),
    });
  });

  it('rejects an archive without an OCI index.json', () => {
    const archive = saveArchive({
      manifest: [{ Config: blobPath(apiConfig), RepoTags: ['apiarylens-api:x'], Layers: [] }],
      members: [[blobPath(apiConfig), apiConfig]],
    });
    expect(() => imageIdentitiesFromArchive(archive)).toThrow(/no OCI index\.json/);
  });

  it('rejects an index whose blob bytes do not match the recorded digest', () => {
    const archive = saveArchive({
      manifest: [{ Config: blobPath(apiConfig), RepoTags: ['apiarylens-api:x'], Layers: [] }],
      members: [
        [blobPath(apiConfig), apiConfig],
        // Tampered manifest blob stored under the untampered digest path.
        [blobPath(apiManifest), webManifest],
      ],
      index: indexFor([apiManifest]),
    });
    expect(() => imageIdentitiesFromArchive(archive)).toThrow(/does not match its recorded digest/);
  });

  it('rejects an index that does not cover an image in manifest.json', () => {
    const archive = saveArchive({
      manifest: [{ Config: blobPath(webConfig), RepoTags: ['apiarylens-web:x'], Layers: [] }],
      members: [
        [blobPath(webConfig), webConfig],
        [blobPath(apiManifest), apiManifest],
      ],
      index: indexFor([apiManifest]),
    });
    expect(() => imageIdentitiesFromArchive(archive)).toThrow(/does not cover the image/);
  });
});

describe('tar metadata records (Go archive/tar shapes)', () => {
  it('applies a pax extended-header path override to the following entry', () => {
    const paxPath = 'blobs/sha256/deadbeef';
    const record = `path=${paxPath}\n`;
    const length = record.length + `${record.length + 3} `.length;
    const pax = Buffer.from(`${length} ${record}`);
    const archive = Buffer.concat([
      rawEntry('PaxHeaders.0/config', 'x', pax),
      rawEntry('config-truncated', '0', apiConfig),
      rawEntry(
        'manifest.json',
        '0',
        Buffer.from(JSON.stringify([{ Config: paxPath, RepoTags: ['apiarylens-api:pax'] }])),
      ),
      Buffer.alloc(1024),
    ]);
    const names = [...tarEntries(archive)].map((entry) => entry.name);
    expect(names).toContain(paxPath);
    expect(imageIdsFromArchive(archive).get('apiarylens-api:pax')).toBe(sha256(apiConfig));
  });

  it('applies a GNU long-name record to the following entry', () => {
    const longName = `blobs/sha256/${'f'.repeat(64)}-with-an-extremely-long-suffix-${'x'.repeat(60)}`;
    const archive = Buffer.concat([
      rawEntry('././@LongLink', 'L', Buffer.from(`${longName}\0`)),
      rawEntry(longName.slice(0, 99), '0', webConfig),
      rawEntry(
        'manifest.json',
        '0',
        Buffer.from(JSON.stringify([{ Config: longName, RepoTags: ['apiarylens-web:long'] }])),
      ),
      Buffer.alloc(1024),
    ]);
    expect(imageIdsFromArchive(archive).get('apiarylens-web:long')).toBe(sha256(webConfig));
  });

  it('ignores pax global headers without corrupting subsequent entries', () => {
    const archive = Buffer.concat([
      rawEntry('pax_global_header', 'g', Buffer.from('20 comment=irrelevant\n')),
      rawEntry('manifest.json', '0', Buffer.from(JSON.stringify([]))),
      Buffer.alloc(1024),
    ]);
    expect(imageIdsFromArchive(archive).size).toBe(0);
  });
});

describe('verifyBundleImageIdentity', () => {
  it('accepts a manifest whose recorded identities are archive-derived', () => {
    expect(verifyBundleImageIdentity(bundleManifestFor(), productArchive())).toEqual([]);
  });

  it('reports a recorded ID no docker load can reproduce (the shipped preview.4 defect)', () => {
    const failures = verifyBundleImageIdentity(
      bundleManifestFor({ apiImageId: `sha256:${'8'.repeat(64)}` }),
      productArchive(),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/apiarylens-api:0\.1\.0-preview\.4 \(api\)/);
    expect(failures[0]).toMatch(/every docker load of the images archive reproduces/);
  });

  it('reports a recorded manifest digest the archive index does not record', () => {
    const failures = verifyBundleImageIdentity(
      bundleManifestFor({ webImageManifestDigest: `sha256:${'7'.repeat(64)}` }),
      productArchive(),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/apiarylens-web:0\.1\.0-preview\.4 \(web\)/);
    expect(failures[0]).toMatch(/the archive's OCI index records/);
  });

  it('reports a missing containerd-store identity (the shipped preview.5 defect class)', () => {
    const failures = verifyBundleImageIdentity(
      bundleManifestFor({ apiImageManifestDigest: undefined }),
      productArchive(),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/does not record apiImageManifestDigest/);
    expect(failures[0]).toMatch(/containerd image-store identity/);
  });

  it('reports an image that is missing from the archive entirely', () => {
    const failures = verifyBundleImageIdentity(
      bundleManifestFor({ helperImage: 'alpine:3.23', helperImageId: sha256(helperConfig) }),
      productArchive(),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/alpine:3\.23 \(helper\) is not present/);
  });

  it('reports a manifest that records no identity at all', () => {
    const failures = verifyBundleImageIdentity({}, productArchive());
    expect(failures).toHaveLength(3);
  });
});

describe('verify-airgap-images.mjs (CI guard)', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'apiarylens-airgap-identity-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeExtractedBundle(manifestOverrides = {}) {
    const bundleDir = join(root, 'bundle');
    mkdirSync(join(bundleDir, 'images'), { recursive: true });
    const manifest = {
      productVersion: '0.1.0-preview.4',
      imagesArchive: 'images/apiarylens-images-0.1.0-preview.4.tar',
      ...bundleManifestFor(manifestOverrides),
    };
    writeFileSync(
      join(bundleDir, 'bundle-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    writeFileSync(join(bundleDir, manifest.imagesArchive), productArchive());
    return { bundleDir, manifest };
  }

  function runVerifier(args) {
    return spawnSync(
      process.execPath,
      [join(import.meta.dirname, 'verify-airgap-images.mjs'), ...args],
      {
        encoding: 'utf8',
      },
    );
  }

  it('passes an extracted bundle whose recorded IDs match the archive', () => {
    const { bundleDir } = writeExtractedBundle();
    const result = runVerifier(['--bundle-dir', bundleDir]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/load-reproducible/);
  });

  it('fails closed (exit 65) on a store-specific recorded ID', () => {
    const { bundleDir } = writeExtractedBundle({ webImageId: `sha256:${'5'.repeat(64)}` });
    const result = runVerifier(['--bundle-dir', bundleDir]);
    expect(result.status).toBe(65);
    expect(result.stderr).toMatch(/every docker load of the images archive reproduces/);
    expect(result.stderr).toMatch(/would refuse this bundle everywhere/);
  });

  it('fails closed (exit 65) on a wrong or missing containerd-store identity', () => {
    const wrong = writeExtractedBundle({ apiImageManifestDigest: `sha256:${'6'.repeat(64)}` });
    const wrongResult = runVerifier(['--bundle-dir', wrong.bundleDir]);
    expect(wrongResult.status).toBe(65);
    expect(wrongResult.stderr).toMatch(/the archive's OCI index records/);
    rmSync(wrong.bundleDir, { recursive: true, force: true });
    const missing = writeExtractedBundle({ helperImageManifestDigest: undefined });
    const missingResult = runVerifier(['--bundle-dir', missing.bundleDir]);
    expect(missingResult.status).toBe(65);
    expect(missingResult.stderr).toMatch(/does not record helperImageManifestDigest/);
  });

  it('verifies a packed bundle tar directly', () => {
    const { manifest } = writeExtractedBundle();
    const packed = createTar(
      new Map([
        ['bundle-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
        [manifest.imagesArchive, productArchive()],
      ]),
    );
    const packedPath = join(root, 'apiarylens-0.1.0-preview.4-airgap-000000000000.tar');
    writeFileSync(packedPath, packed);
    const result = runVerifier(['--bundle', packedPath]);
    expect(result.status).toBe(0);
  });

  it('exits 64 on usage errors', () => {
    expect(runVerifier([]).status).toBe(64);
    expect(runVerifier(['--bundle-dir']).status).toBe(64);
    expect(runVerifier(['--bundle', 'a.tar', 'extra']).status).toBe(64);
  });
});
