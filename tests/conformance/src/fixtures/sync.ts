import {
  resourceSchemas,
  syncPullResponseSchema,
  syncPushResponseSchema,
} from '@apiarylens/contracts';
import { expect } from 'vitest';
import { readErrorCode, readJson } from '../harness/actor.js';
import { apiaryFields, createOperation, hiveFields } from './data.js';
import type { ConformanceFixture } from './types.js';

export const syncFixtures: readonly ConformanceFixture[] = [
  {
    contract: 'sync/push.accepted-batch',
    title: 'a valid create batch is accepted with version 1 server values',
    async run(world) {
      const owner = await world.owner();
      const apiaryOperation = createOperation('apiary', { ...apiaryFields });
      const hiveOperation = createOperation('hive', hiveFields(apiaryOperation.entityId));
      const response = await owner.push([apiaryOperation, hiveOperation]);
      expect(response.status).toBe(200);
      const body = syncPushResponseSchema.parse(await response.json());
      expect(body.syncContractVersion).toBe(1);
      expect(body.results).toHaveLength(2);
      for (const result of body.results) {
        expect(result.status).toBe('accepted');
        expect(result.version).toBe(1);
      }
      const serverApiary = body.results[0]!.serverValue!;
      resourceSchemas.apiary.parse(serverApiary);
      expect(serverApiary.name).toBe(apiaryFields.name);
      expect(serverApiary.organizationId).toBe(owner.organizationId);
      expect(serverApiary.deletedAt).toBeNull();
    },
  },
  {
    contract: 'sync/push.idempotent-replay',
    title: 'replaying an identical batch reports duplicate without reapplying it',
    async run(world) {
      const owner = await world.owner();
      const operation = createOperation('apiary', { ...apiaryFields });
      const first = await owner.mustPush([operation]);
      expect(first[0]?.status).toBe('accepted');
      const replay = await owner.mustPush([operation]);
      expect(replay[0]?.status).toBe('duplicate');
      expect(replay[0]?.version).toBe(1);
      const list = await readJson<{ items: unknown[] }>(
        await owner.request('/api/v1/resources/apiary'),
      );
      expect(list.items).toHaveLength(1);
    },
  },
  {
    contract: 'sync/push.idempotency-key-reuse',
    title: 'reusing an operation id with different content is rejected as idempotency_key_reused',
    async run(world) {
      const owner = await world.owner();
      const operation = createOperation('apiary', { ...apiaryFields });
      await owner.mustPush([operation]);
      const reused = await owner.mustPush([
        { ...operation, payload: { name: 'Different content, same operation id' } },
      ]);
      expect(reused[0]?.status).toBe('rejected');
      expect(reused[0]?.errorCode).toBe('idempotency_key_reused');
    },
  },
  {
    contract: 'sync/push.stale-version-conflict',
    title: 'updates against a stale base version conflict with both value sides attached',
    async run(world) {
      const owner = await world.owner();
      const create = createOperation('apiary', { ...apiaryFields });
      await owner.mustPush([create]);
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
      const stale = await owner.mustPush([
        createOperation(
          'apiary',
          { ...apiaryFields, name: 'Stale client rename' },
          {
            entityId: create.entityId,
            action: 'update',
            baseVersion: 1,
          },
        ),
      ]);
      expect(stale[0]?.status).toBe('conflict');
      expect(stale[0]?.version).toBe(2);
      expect(stale[0]?.serverValue?.name).toBe('Server rename');
      expect(stale[0]?.clientValue?.name).toBe('Stale client rename');
    },
  },
  {
    contract: 'sync/push.create-collision',
    title: 'creating an entity id that already exists conflicts instead of overwriting',
    async run(world) {
      const owner = await world.owner();
      const create = createOperation('apiary', { ...apiaryFields });
      await owner.mustPush([create]);
      const collision = await owner.mustPush([
        createOperation('apiary', { name: 'Collision attempt' }, { entityId: create.entityId }),
      ]);
      expect(collision[0]?.status).toBe('conflict');
      expect(collision[0]?.serverValue?.name).toBe(apiaryFields.name);
    },
  },
  {
    contract: 'sync/push.delete-tombstone',
    title: 'a delete produces a tombstone: reads 404 and the change feed records the delete',
    async run(world) {
      const owner = await world.owner();
      const create = createOperation('apiary', { ...apiaryFields });
      await owner.mustPush([create]);
      const deletion = await owner.mustPush([
        createOperation('apiary', null, {
          entityId: create.entityId,
          action: 'delete',
          baseVersion: 1,
        }),
      ]);
      expect(deletion[0]?.status).toBe('accepted');
      expect(deletion[0]?.version).toBe(2);

      expect((await owner.request(`/api/v1/resources/apiary/${create.entityId}`)).status).toBe(404);
      const list = await readJson<{ items: unknown[] }>(
        await owner.request('/api/v1/resources/apiary'),
      );
      expect(list.items).toEqual([]);

      const pull = syncPullResponseSchema.parse(
        await (await owner.request('/api/v1/sync/pull')).json(),
      );
      const deleteChange = pull.changes.at(-1)!;
      expect(deleteChange.action).toBe('delete');
      expect(deleteChange.entityId).toBe(create.entityId);
      expect(deleteChange.version).toBe(2);
      expect(deleteChange.value).toBeNull();
    },
  },
  {
    contract: 'sync/push.batch-envelope',
    title: 'the push envelope enforces contract version and 1–100 operation bounds',
    async run(world) {
      const owner = await world.owner();
      const emptyBatch = await owner.push([]);
      expect(emptyBatch.status).toBe(400);
      expect(await readErrorCode(emptyBatch)).toBe('validation_failed');

      const oversized = await owner.push(
        Array.from({ length: 101 }, () => createOperation('apiary', { ...apiaryFields })),
      );
      expect(oversized.status).toBe(400);

      const wrongVersion = await owner.request('/api/v1/sync/push', {
        json: {
          syncContractVersion: 2,
          operations: [createOperation('apiary', { ...apiaryFields })],
        },
      });
      expect(wrongVersion.status).toBe(400);
      expect(await readErrorCode(wrongVersion)).toBe('validation_failed');
    },
  },
  {
    contract: 'sync/pull.pagination',
    title: 'the change feed pages deterministically with an advancing opaque cursor',
    async run(world) {
      const owner = await world.owner();
      await owner.mustPush(
        Array.from({ length: 5 }, (_, index) =>
          createOperation('apiary', { ...apiaryFields, name: `Yard ${index + 1}` }),
        ),
      );
      const collected: string[] = [];
      let cursor = '0';
      let pages = 0;
      let hasMore = true;
      while (hasMore) {
        const page = syncPullResponseSchema.parse(
          await (
            await owner.request(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=2`)
          ).json(),
        );
        pages += 1;
        expect(page.changes.length).toBeLessThanOrEqual(2);
        for (const change of page.changes) collected.push(change.entityId);
        if (page.hasMore) expect(page.nextCursor).not.toBe(cursor);
        cursor = page.nextCursor;
        hasMore = page.hasMore;
      }
      expect(pages).toBe(3);
      expect(new Set(collected).size).toBe(5);

      const drained = syncPullResponseSchema.parse(
        await (
          await owner.request(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=2`)
        ).json(),
      );
      expect(drained.changes).toEqual([]);
      expect(drained.hasMore).toBe(false);
      expect(drained.nextCursor).toBe(cursor);
      expect(drained.fullResyncRequired).toBe(false);
    },
  },
  {
    contract: 'sync/pull.cursor-validation',
    title: 'malformed cursors and limits are rejected with cursor_invalid',
    async run(world) {
      const owner = await world.owner();
      for (const query of ['cursor=abc', 'cursor=-1', 'limit=abc']) {
        const response = await owner.request(`/api/v1/sync/pull?${query}`);
        expect(response.status, query).toBe(400);
        expect(await readErrorCode(response), query).toBe('cursor_invalid');
      }
    },
  },
  {
    contract: 'sync/pull.update-round-trip',
    title: 'an accepted update surfaces in the change feed with the incremented version',
    async run(world) {
      const owner = await world.owner();
      const create = createOperation('apiary', { ...apiaryFields });
      await owner.mustPush([create]);
      const updated = await owner.mustPush([
        createOperation(
          'apiary',
          { ...apiaryFields, name: 'Renamed yard' },
          {
            entityId: create.entityId,
            action: 'update',
            baseVersion: 1,
          },
        ),
      ]);
      expect(updated[0]?.status).toBe('accepted');
      expect(updated[0]?.version).toBe(2);

      const pull = syncPullResponseSchema.parse(
        await (await owner.request('/api/v1/sync/pull')).json(),
      );
      expect(pull.changes).toHaveLength(2);
      const latest = pull.changes.at(-1)!;
      expect(latest.action).toBe('upsert');
      expect(latest.version).toBe(2);
      expect(latest.value?.name).toBe('Renamed yard');
    },
  },
];
