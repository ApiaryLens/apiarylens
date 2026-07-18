import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { readErrorCode, readJson, type ApiActor } from '../harness/actor.js';
import { createOperation, jpegBytes, mediaAssetFields } from './data.js';
import type { ConformanceFixture } from './types.js';

async function stageMediaMetadata(
  actor: ApiActor,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const operation = createOperation('mediaAsset', mediaAssetFields(bytes));
  const [result] = await actor.mustPush([operation]);
  if (result?.status !== 'accepted') {
    throw new Error(`Media metadata staging failed: ${result?.status}`);
  }
  return operation.entityId;
}

export const mediaFixtures: readonly ConformanceFixture[] = [
  {
    contract: 'media/upload.integrity-round-trip',
    title: 'an integrity-checked upload becomes ready and downloads byte-identical',
    async run(world) {
      const owner = await world.owner();
      const bytes = jpegBytes(2048, 0x17);
      const mediaId = await stageMediaMetadata(owner, bytes);

      const upload = await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: bytes,
      });
      expect(upload.status).toBe(200);
      const updated = await readJson<{ state: string; version: number }>(upload);
      expect(updated.state).toBe('ready');
      expect(updated.version).toBe(2);

      const download = await owner.request(`/api/v1/media/${mediaId}/content`);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toBe('image/jpeg');
      expect(Array.from(new Uint8Array(await download.arrayBuffer()))).toEqual(Array.from(bytes));

      const resource = await readJson<{ state: string }>(
        await owner.request(`/api/v1/resources/mediaAsset/${mediaId}`),
      );
      expect(resource.state).toBe('ready');
    },
  },
  {
    contract: 'media/upload.integrity-rejected',
    title: 'bytes that do not match the declared SHA-256 are rejected and never stored',
    async run(world) {
      const owner = await world.owner();
      const declared = jpegBytes(2048, 0x17);
      const tampered = jpegBytes(2048, 0x99);
      const mediaId = await stageMediaMetadata(owner, declared);

      const upload = await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: tampered,
      });
      expect(upload.status).toBe(400);
      expect(await readErrorCode(upload)).toBe('media_integrity_failed');

      const download = await owner.request(`/api/v1/media/${mediaId}/content`);
      expect(download.status).toBe(404);
      expect(await readErrorCode(download)).toBe('media_content_missing');
      const resource = await readJson<{ state: string }>(
        await owner.request(`/api/v1/resources/mediaAsset/${mediaId}`),
      );
      expect(resource.state).toBe('staged');
    },
  },
  {
    contract: 'media/upload.type-mismatch',
    title: 'a content type that contradicts the metadata is rejected as media_type_mismatch',
    async run(world) {
      const owner = await world.owner();
      const bytes = jpegBytes(1024, 0x23);
      const mediaId = await stageMediaMetadata(owner, bytes);
      const upload = await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: bytes,
      });
      expect(upload.status).toBe(400);
      expect(await readErrorCode(upload)).toBe('media_type_mismatch');
    },
  },
  {
    contract: 'media/upload.size-bounds',
    title: 'empty uploads are rejected as media_size_invalid',
    async run(world) {
      const owner = await world.owner();
      const bytes = jpegBytes(512, 0x31);
      const mediaId = await stageMediaMetadata(owner, bytes);
      const upload = await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: new Uint8Array(0),
      });
      expect(upload.status).toBe(400);
      expect(await readErrorCode(upload)).toBe('media_size_invalid');
    },
  },
  {
    contract: 'media/thumbnail.contract',
    title: 'thumbnails accept small JPEGs only and fall back to the original when absent',
    async run(world) {
      const owner = await world.owner();
      const original = jpegBytes(2048, 0x45);
      const thumbnail = jpegBytes(512, 0x46);
      const mediaId = await stageMediaMetadata(owner, original);
      const originalUpload = await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: original,
      });
      expect(originalUpload.status).toBe(200);

      const fallback = await owner.request(`/api/v1/media/${mediaId}/content?variant=thumbnail`);
      expect(fallback.status).toBe(200);
      expect(fallback.headers.get('content-type')).toBe('image/jpeg');
      expect(Array.from(new Uint8Array(await fallback.arrayBuffer()))).toEqual(
        Array.from(original),
      );

      const wrongType = await owner.request(`/api/v1/media/${mediaId}/thumbnail`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: thumbnail,
      });
      expect(wrongType.status).toBe(400);
      expect(await readErrorCode(wrongType)).toBe('thumbnail_invalid');

      const oversized = await owner.request(`/api/v1/media/${mediaId}/thumbnail`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: jpegBytes(600 * 1024, 0x47),
      });
      expect(oversized.status).toBe(400);
      expect(await readErrorCode(oversized)).toBe('thumbnail_invalid');

      const accepted = await owner.request(`/api/v1/media/${mediaId}/thumbnail`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: thumbnail,
      });
      expect(accepted.status).toBe(204);

      const served = await owner.request(`/api/v1/media/${mediaId}/content?variant=thumbnail`);
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe('image/jpeg');
      expect(Array.from(new Uint8Array(await served.arrayBuffer()))).toEqual(Array.from(thumbnail));
    },
  },
  {
    contract: 'media/content.missing',
    title: 'metadata without uploaded bytes reads as media_content_missing',
    async run(world) {
      const owner = await world.owner();
      const mediaId = await stageMediaMetadata(owner, jpegBytes(256, 0x51));
      const response = await owner.request(`/api/v1/media/${mediaId}/content`);
      expect(response.status).toBe(404);
      expect(await readErrorCode(response)).toBe('media_content_missing');
    },
  },
  {
    contract: 'media/unknown.not-found',
    title: 'media operations on unknown ids are rejected as media_not_found',
    async run(world) {
      const owner = await world.owner();
      const unknown = randomUUID();
      const attempts: Array<[string, string, Uint8Array<ArrayBuffer> | undefined]> = [
        ['GET', `/api/v1/media/${unknown}/content`, undefined],
        ['PUT', `/api/v1/media/${unknown}/content`, jpegBytes(64, 0x61)],
        ['PUT', `/api/v1/media/${unknown}/thumbnail`, jpegBytes(64, 0x62)],
        ['DELETE', `/api/v1/media/${unknown}/content`, undefined],
      ];
      for (const [method, path, body] of attempts) {
        const response = await owner.request(path, {
          method,
          headers: { 'content-type': 'image/jpeg' },
          ...(body ? { body } : {}),
        });
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(await readErrorCode(response), `${method} ${path}`).toBe('media_not_found');
      }
    },
  },
  {
    contract: 'media/delete.explicit-content-removal',
    title: 'deleting content removes the bytes and marks the asset deleted at the next version',
    async run(world) {
      const owner = await world.owner();
      const bytes = jpegBytes(1024, 0x71);
      const mediaId = await stageMediaMetadata(owner, bytes);
      await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: bytes,
      });

      const deletion = await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'DELETE',
      });
      expect(deletion.status).toBe(204);

      const download = await owner.request(`/api/v1/media/${mediaId}/content`);
      expect(download.status).toBe(404);
      expect(await readErrorCode(download)).toBe('media_content_missing');

      const resource = await readJson<{ state: string; version: number }>(
        await owner.request(`/api/v1/resources/mediaAsset/${mediaId}`),
      );
      expect(resource.state).toBe('deleted');
      // staged (1) → content upload (2) → explicit content delete (3)
      expect(resource.version).toBe(3);
    },
  },
  {
    contract: 'media/sync-delete.tombstoned-metadata',
    title: 'a sync delete of the asset cascades: bytes gone and every media verb answers 404',
    async run(world) {
      const owner = await world.owner();
      const bytes = jpegBytes(1024, 0x81);
      const mediaId = await stageMediaMetadata(owner, bytes);
      await owner.request(`/api/v1/media/${mediaId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: bytes,
      });

      const deletion = await owner.mustPush([
        createOperation('mediaAsset', null, {
          entityId: mediaId,
          action: 'delete',
          baseVersion: 2,
        }),
      ]);
      expect(deletion[0]?.status).toBe('accepted');

      for (const [method, body] of [
        ['GET', undefined],
        ['PUT', bytes],
        ['DELETE', undefined],
      ] as const) {
        const response = await owner.request(`/api/v1/media/${mediaId}/content`, {
          method,
          headers: { 'content-type': 'image/jpeg' },
          ...(body ? { body } : {}),
        });
        expect(response.status, `${method} deleted media`).toBe(404);
        expect(await readErrorCode(response)).toBe('media_not_found');
      }
    },
  },
];
