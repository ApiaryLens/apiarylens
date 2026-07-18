/**
 * Client-core conformance: the REAL shared client core (`apps/web/src/db.ts`
 * — the offline replica, outbox, conflict, and media sync engine used by the
 * web PWA and by the Windows client's connected mode) is driven end-to-end
 * against BOTH backend profiles through a fetch bridge. No client logic is
 * duplicated here; a failure means a client/backend contract broke.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLocalWorkspace,
  db,
  queueCreate,
  queueDelete,
  queueUpdate,
  resolveConflict,
  stageImage,
  synchronize,
} from '@apiarylens/web/client-core';
import type { ApiActor } from './harness/actor.js';
import { backendFactories } from './harness/runner.js';
import { World } from './harness/world.js';
import {
  apiaryFields,
  createOperation,
  hiveFields,
  inspectionFields,
  jpegBytes,
} from './fixtures/data.js';

const originalFetch = globalThis.fetch;

function bridgeFetch(world: World, actor: ApiActor): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? `${input.pathname}${input.search}`
          : new URL(input.url).pathname;
    const headers = new Headers(init?.headers);
    if (actor.cookie) headers.set('cookie', actor.cookie);
    return world.backend.request(path, { ...init, headers });
  }) as typeof fetch;
}

for (const factory of backendFactories) {
  describe(`client-core contract × ${factory.label} backend`, () => {
    afterEach(async () => {
      globalThis.fetch = originalFetch;
      await clearLocalWorkspace();
    });

    it('[client/sync.outbox-round-trip] queued offline work synchronizes and converges to server versions', async () => {
      const world = new World(factory.create());
      try {
        const owner = await world.owner();
        bridgeFetch(world, owner);
        const organizationId = owner.organizationId;

        const apiaryId = await queueCreate(organizationId, 'apiary', { ...apiaryFields });
        const hiveId = await queueCreate(organizationId, 'hive', hiveFields(apiaryId));
        await synchronize(organizationId, owner.csrfToken);

        const localApiary = await db.resources.get(`${organizationId}:apiary:${apiaryId}`);
        expect(localApiary?.syncState).toBe('synchronized');
        expect(localApiary?.version).toBe(1);
        expect(localApiary?.data.name).toBe(apiaryFields.name);
        expect(await db.outbox.count()).toBe(0);

        const serverSide = await owner.request(`/api/v1/resources/hive/${hiveId}`);
        expect(serverSide.status).toBe(200);
      } finally {
        world.close();
      }
    });

    it('[client/sync.pull-replication] server-side changes replicate into the local store as synchronized records', async () => {
      const world = new World(factory.create());
      try {
        const owner = await world.owner();
        const apiaryOperation = createOperation('apiary', { ...apiaryFields });
        const hiveOperation = createOperation('hive', hiveFields(apiaryOperation.entityId));
        await owner.mustPush([apiaryOperation, hiveOperation]);

        bridgeFetch(world, owner);
        const organizationId = owner.organizationId;
        await synchronize(organizationId, owner.csrfToken);

        const apiary = await db.resources.get(
          `${organizationId}:apiary:${apiaryOperation.entityId}`,
        );
        const hive = await db.resources.get(`${organizationId}:hive:${hiveOperation.entityId}`);
        expect(apiary?.syncState).toBe('synchronized');
        expect(apiary?.data.name).toBe(apiaryFields.name);
        expect(hive?.syncState).toBe('synchronized');
      } finally {
        world.close();
      }
    });

    it('[client/sync.conflict-surfaced-and-resolved] a stale local edit conflicts with both sides attached, then resolves locally', async () => {
      const world = new World(factory.create());
      try {
        const owner = await world.owner();
        const create = createOperation('apiary', { ...apiaryFields });
        await owner.mustPush([create]);

        bridgeFetch(world, owner);
        const organizationId = owner.organizationId;
        const key = `${organizationId}:apiary:${create.entityId}`;
        await synchronize(organizationId, owner.csrfToken);

        await owner.mustPush([
          createOperation(
            'apiary',
            { ...apiaryFields, name: 'Server rename' },
            {
              entityId: create.entityId,
              action: 'update',
              baseVersion: 1,
            },
          ),
        ]);

        let record = await db.resources.get(key);
        await queueUpdate(record!, { name: 'Local rename' });
        await synchronize(organizationId, owner.csrfToken);

        record = await db.resources.get(key);
        expect(record?.syncState).toBe('conflicted');
        expect(record?.conflict?.serverValue.name).toBe('Server rename');
        expect(record?.conflict?.clientValue.name).toBe('Local rename');

        await resolveConflict(record!, 'local');
        await synchronize(organizationId, owner.csrfToken);

        record = await db.resources.get(key);
        expect(record?.syncState).toBe('synchronized');
        expect(record?.version).toBe(3);
        const serverValue = (await (
          await owner.request(`/api/v1/resources/apiary/${create.entityId}`)
        ).json()) as { name: string };
        expect(serverValue.name).toBe('Local rename');
      } finally {
        world.close();
      }
    });

    it('[client/sync.delete-propagation] a local delete tombstones the record on the server and drains the outbox', async () => {
      const world = new World(factory.create());
      try {
        const owner = await world.owner();
        const create = createOperation('apiary', { ...apiaryFields });
        await owner.mustPush([create]);

        bridgeFetch(world, owner);
        const organizationId = owner.organizationId;
        const key = `${organizationId}:apiary:${create.entityId}`;
        await synchronize(organizationId, owner.csrfToken);

        const record = await db.resources.get(key);
        await queueDelete(record!);
        await synchronize(organizationId, owner.csrfToken);

        expect((await owner.request(`/api/v1/resources/apiary/${create.entityId}`)).status).toBe(
          404,
        );
        expect(await db.resources.get(key)).toBeUndefined();
        expect(await db.outbox.count()).toBe(0);
      } finally {
        world.close();
      }
    });

    it('[client/media.staged-upload] a staged image synchronizes metadata and bytes and becomes ready everywhere', async () => {
      const world = new World(factory.create());
      try {
        const owner = await world.owner();
        bridgeFetch(world, owner);
        const organizationId = owner.organizationId;

        const apiaryId = await queueCreate(organizationId, 'apiary', { ...apiaryFields });
        const hiveId = await queueCreate(organizationId, 'hive', hiveFields(apiaryId));
        const inspectionId = await queueCreate(
          organizationId,
          'inspection',
          inspectionFields(hiveId),
        );
        const bytes = jpegBytes(1024, 0x91);
        const file = new File([bytes], 'brood-frame.jpg', { type: 'image/jpeg' });
        const mediaId = await stageImage(organizationId, hiveId, inspectionId, file, 'Brood frame');

        await synchronize(organizationId, owner.csrfToken);

        const localMedia = await db.media.get(mediaId);
        expect(localMedia?.state).toBe('ready');
        const localResource = await db.resources.get(`${organizationId}:mediaAsset:${mediaId}`);
        expect(localResource?.syncState).toBe('synchronized');
        expect(localResource?.data.state).toBe('ready');

        const download = await owner.request(`/api/v1/media/${mediaId}/content`);
        expect(download.status).toBe(200);
        expect(Array.from(new Uint8Array(await download.arrayBuffer()))).toEqual(Array.from(bytes));
      } finally {
        world.close();
      }
    });
  });
}
