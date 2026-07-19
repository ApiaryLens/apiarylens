import { describe, expect, it } from 'vitest';
import { ExportArchiveError, parseExportArchive } from './export-import.js';

// The contracts package stays runtime-neutral, so the tests use Web Crypto
// exactly as the Cloudflare profile does.
const sha256 = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const randomUUID = () => crypto.randomUUID();

const apiaryId = randomUUID();
const mediaId = randomUUID();
const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

function record(fields: Record<string, unknown>, id = randomUUID()) {
  return {
    id,
    organizationId: randomUUID(),
    version: 3,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    deletedAt: null,
    ...fields,
  };
}

async function archive(overrides: {
  manifest?: Record<string, unknown>;
  data?: Record<string, unknown>;
  extraFiles?: Record<string, Uint8Array>;
  omitMediaFile?: boolean;
}): Promise<Record<string, Uint8Array>> {
  const data = overrides.data ?? {
    apiary: [record({ name: 'North orchard yard' }, apiaryId)],
    mediaAsset: [
      record(
        {
          hiveId: randomUUID(),
          fileName: 'frame.jpg',
          mediaType: 'image/jpeg',
          byteSize: imageBytes.byteLength,
          sha256: await sha256(imageBytes),
          state: 'ready',
        },
        mediaId,
      ),
    ],
  };
  const dataBytes = encode(data);
  const manifest = {
    product: 'ApiaryLens',
    productVersion: '0.1.0-preview.6',
    exportFormat: 1,
    exportedAt: '2026-07-19T09:00:00.000Z',
    dataSha256: await sha256(dataBytes),
    ...overrides.manifest,
  };
  return {
    'manifest.json': encode(manifest),
    'data.json': dataBytes,
    ...(overrides.omitMediaFile ? {} : { [`media/${mediaId}/frame.jpg`]: imageBytes }),
    ...overrides.extraFiles,
  };
}

async function parseError(files: Record<string, Uint8Array>): Promise<ExportArchiveError> {
  try {
    await parseExportArchive(files, sha256);
  } catch (caught) {
    if (caught instanceof ExportArchiveError) return caught;
    throw caught;
  }
  throw new Error('Expected the archive to be refused');
}

describe('export archive verification (WEB-001 restore contract)', () => {
  it('accepts a genuine export and returns validated records plus verified media bytes', async () => {
    const parsed = await parseExportArchive(await archive({}), sha256);
    expect(parsed.records.apiary).toHaveLength(1);
    expect(parsed.records.apiary[0]).toMatchObject({
      id: apiaryId,
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-07-01T10:00:00.000Z',
    });
    expect(parsed.records.apiary[0]?.fields).toEqual({ name: 'North orchard yard' });
    expect(parsed.records.hive).toEqual([]);
    expect(Array.from(parsed.mediaBytes.get(mediaId) ?? [])).toEqual(Array.from(imageBytes));
    expect(parsed.missingMediaIds).toEqual([]);
  });

  it('refuses a file that is not an ApiaryLens export', async () => {
    expect((await parseError({ 'readme.txt': encode('hello') })).code).toBe('invalid');
    expect((await parseError(await archive({ manifest: { product: 'Other' } }))).code).toBe(
      'invalid',
    );
    expect((await parseError(await archive({ manifest: { exportFormat: 99 } }))).code).toBe(
      'invalid',
    );
  });

  it('refuses data that does not match the manifest checksum', async () => {
    const files = await archive({});
    const text = new TextDecoder().decode(files['data.json']);
    files['data.json'] = new TextEncoder().encode(text.replace('North orchard yard', 'Tampered'));
    const refusal = await parseError(files);
    expect(refusal.code).toBe('corrupt');
    expect(refusal.message).toContain('checksum');
  });

  it('refuses records that break the resource contract or repeat identities', async () => {
    const bad = await parseError(
      await archive({
        data: { apiary: [record({ name: '' }, apiaryId)] },
      }),
    );
    expect(bad.code).toBe('corrupt');

    const duplicated = await parseError(
      await archive({
        data: {
          apiary: [record({ name: 'One' }, apiaryId), record({ name: 'Two' }, apiaryId)],
        },
      }),
    );
    expect(duplicated.code).toBe('corrupt');

    const unknown = await parseError(await archive({ data: { apiary: [], notARealType: [] } }));
    expect(unknown.code).toBe('invalid');
  });

  it('refuses image bytes that fail their own recorded checksum', async () => {
    const files = await archive({});
    files[`media/${mediaId}/frame.jpg`] = new Uint8Array([9, 9, 9, 9]);
    const refusal = await parseError(files);
    expect(refusal.code).toBe('corrupt');
    expect(refusal.message).toContain('frame.jpg');
  });

  it('reports ready images whose bytes the archive never carried instead of inventing them', async () => {
    const parsed = await parseExportArchive(await archive({ omitMediaFile: true }), sha256);
    expect(parsed.missingMediaIds).toEqual([mediaId]);
    expect(parsed.mediaBytes.size).toBe(0);
  });

  it('accepts an archive without a recorded checksum only when every record still validates', async () => {
    // Exports older than this feature carry no dataSha256; structural and
    // schema validation still applies so the family's only backup is usable.
    const files = await archive({ manifest: { dataSha256: undefined } });
    const parsed = await parseExportArchive(files, sha256);
    expect(parsed.records.apiary).toHaveLength(1);
  });
});
