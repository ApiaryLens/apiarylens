import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedSession,
  clearLocalWorkspace,
  db,
  queueCreate,
  queueDelete,
  queueUpdate,
  resolveConflict,
  stageImage,
  synchronize,
} from './db.js';

describe('offline workspace', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    await clearLocalWorkspace();
  });

  it('atomically saves a local record and its outbox operation', async () => {
    const organizationId = crypto.randomUUID();
    const id = await queueCreate(organizationId, 'apiary', {
      name: 'Back field',
      notes: 'Windbreak near the north edge',
    });

    const record = await db.resources.get(`${organizationId}:apiary:${id}`);
    const operations = await db.outbox.toArray();
    expect(record?.syncState).toBe('pending');
    expect(record?.data.name).toBe('Back field');
    expect(operations).toHaveLength(1);
    expect(operations[0]?.entityId).toBe(id);
  });

  it('forgets cached account context on local offline sign-out without deleting records', async () => {
    const organizationId = crypto.randomUUID();
    await queueCreate(organizationId, 'apiary', { name: 'Offline yard' });
    await db.settings.put({ key: 'session', value: { organization: { id: organizationId } } });
    await clearCachedSession();
    expect(await db.settings.get('session')).toBeUndefined();
    expect(await db.resources.count()).toBe(1);
  });

  it('announces a committed local save so an online client can synchronize immediately', async () => {
    const browserEvents = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: browserEvents, configurable: true });
    const listener = vi.fn();
    browserEvents.addEventListener('apiarylens:local-change', listener);

    await queueCreate(crypto.randomUUID(), 'apiary', { name: 'Connected yard' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('validates records before writing offline state', async () => {
    await expect(queueCreate(crypto.randomUUID(), 'apiary', { name: '' })).rejects.toThrow();
    expect(await db.resources.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('folds edits into an unsynchronized create operation', async () => {
    const organizationId = crypto.randomUUID();
    const id = await queueCreate(organizationId, 'apiary', { name: 'Original' });
    const record = await db.resources.get(`${organizationId}:apiary:${id}`);
    if (!record) throw new Error('Local record missing');
    await queueUpdate(record, { name: 'Updated offline' });
    expect(await db.outbox.toArray()).toHaveLength(1);
    expect((await db.outbox.toArray())[0]?.payload?.name).toBe('Updated offline');
  });

  it('stages image bytes and metadata together', async () => {
    const organizationId = crypto.randomUUID();
    const file = new File([new Uint8Array([0xff, 0xd8, 1, 2])], 'yard.jpg', {
      type: 'image/jpeg',
    });
    const id = await stageImage(organizationId, crypto.randomUUID(), crypto.randomUUID(), file);
    expect((await db.media.get(id))?.state).toBe('staged');
    expect((await db.resources.get(`${organizationId}:mediaAsset:${id}`))?.data.sha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('lets a user keep the server or retry the local value after a conflict', async () => {
    const organizationId = crypto.randomUUID();
    const id = await queueCreate(organizationId, 'apiary', { name: 'Local name' });
    const key = `${organizationId}:apiary:${id}`;
    const record = await db.resources.get(key);
    if (!record) throw new Error('Local record missing');
    const timestamp = new Date().toISOString();
    const conflict = {
      serverValue: {
        id,
        organizationId,
        name: 'Server name',
        version: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      },
      clientValue: { name: 'Local name' },
    };
    await db.resources.update(key, { syncState: 'conflicted', conflict });
    const conflicted = await db.resources.get(key);
    if (!conflicted) throw new Error('Conflict record missing');
    await resolveConflict(conflicted, 'local');
    expect((await db.resources.get(key))?.syncState).toBe('pending');
    expect((await db.outbox.toArray())[0]?.baseVersion).toBe(2);

    const pendingAgain = await db.resources.get(key);
    if (!pendingAgain) throw new Error('Pending record missing');
    await resolveConflict({ ...pendingAgain, syncState: 'conflicted', conflict }, 'server');
    expect((await db.resources.get(key))?.data.name).toBe('Server name');
    expect(await db.outbox.count()).toBe(0);
  });

  it('removes an unsynchronized record atomically and queues deletion for a synchronized record', async () => {
    const organizationId = crypto.randomUUID();
    const localId = await queueCreate(organizationId, 'apiary', { name: 'Temporary' });
    const local = await db.resources.get(`${organizationId}:apiary:${localId}`);
    if (!local) throw new Error('Local record missing');
    await queueDelete(local);
    expect(await db.resources.get(local.key)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);

    const syncedId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    await db.resources.put({
      key: `${organizationId}:apiary:${syncedId}`,
      id: syncedId,
      organizationId,
      entityType: 'apiary',
      version: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      syncState: 'synchronized',
      data: { name: 'Synced' },
    });
    const synced = await db.resources.get(`${organizationId}:apiary:${syncedId}`);
    if (!synced) throw new Error('Synced record missing');
    await queueDelete(synced);
    expect((await db.outbox.toArray())[0]).toMatchObject({
      action: 'delete',
      baseVersion: 3,
      payload: null,
    });
    expect((await db.resources.get(synced.key))?.deletedAt).not.toBeNull();
  });

  it('keeps queued work pending when a transient network failure interrupts synchronization', async () => {
    const organizationId = crypto.randomUUID();
    const id = await queueCreate(organizationId, 'apiary', { name: 'Offline yard' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));

    await expect(synchronize(organizationId, 'csrf')).rejects.toThrow('offline');

    expect((await db.resources.get(`${organizationId}:apiary:${id}`))?.syncState).toBe('pending');
    expect((await db.outbox.toArray())[0]).toMatchObject({ attempts: 1, lastError: 'offline' });
  });

  it('reserves failed state for a permanent server rejection', async () => {
    const organizationId = crypto.randomUUID();
    const id = await queueCreate(organizationId, 'apiary', { name: 'Invalid server value' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 422 }));

    await expect(synchronize(organizationId, 'csrf')).rejects.toThrow('Push failed (422)');

    expect((await db.resources.get(`${organizationId}:apiary:${id}`))?.syncState).toBe('failed');
    expect(await db.outbox.count()).toBe(1);
  });

  it('keeps image bytes staged and not failed when upload loses connectivity', async () => {
    const organizationId = crypto.randomUUID();
    const file = new File([new Uint8Array([0xff, 0xd8, 1, 2])], 'offline-photo.jpg', {
      type: 'image/jpeg',
    });
    const id = await stageImage(organizationId, crypto.randomUUID(), crypto.randomUUID(), file);
    const localRecord = await db.resources.get(`${organizationId}:mediaAsset:${id}`);
    const operation = await db.outbox.where('entityId').equals(id).first();
    if (!localRecord || !operation) throw new Error('Staged media fixture missing');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              operationId: operation.operationId,
              entityType: 'mediaAsset',
              entityId: id,
              status: 'accepted',
              serverValue: {
                id,
                organizationId,
                ...localRecord.data,
                version: 1,
                createdAt: localRecord.createdAt,
                updatedAt: localRecord.updatedAt,
                deletedAt: null,
              },
            },
          ],
        }),
      )
      .mockRejectedValueOnce(new TypeError('connection lost'));

    await expect(synchronize(organizationId, 'csrf')).rejects.toThrow('connection lost');

    expect((await db.media.get(id))?.state).toBe('staged');
    expect((await db.media.get(id))?.lastError).toBe('connection lost');
  });

  it("never pushes another organization's queued operations", async () => {
    const firstOrganization = crypto.randomUUID();
    const secondOrganization = crypto.randomUUID();
    const firstId = await queueCreate(firstOrganization, 'apiary', { name: 'First family' });
    await queueCreate(secondOrganization, 'apiary', { name: 'Second family' });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/sync/push')) {
        const request = JSON.parse(String(init?.body)) as {
          operations: Array<{ entityId: string }>;
        };
        expect(request.operations.map((item) => item.entityId)).toEqual([firstId]);
        return Response.json({
          results: request.operations.map((item) => ({
            operationId: (
              JSON.parse(String(init?.body)) as { operations: Array<{ operationId: string }> }
            ).operations[0]?.operationId,
            entityType: 'apiary',
            entityId: item.entityId,
            status: 'duplicate',
            serverValue: {
              id: item.entityId,
              organizationId: firstOrganization,
              name: 'First family',
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
            },
          })),
        });
      }
      return Response.json({ changes: [], nextCursor: '1' });
    });

    await synchronize(firstOrganization, 'csrf');

    expect(await db.outbox.where('organizationId').equals(secondOrganization).count()).toBe(1);
  });

  it('drains every queued push batch in one automatic synchronization pass', async () => {
    const organizationId = crypto.randomUUID();
    for (let index = 0; index < 101; index += 1) {
      await queueCreate(organizationId, 'apiary', { name: `Yard ${index}` });
    }
    const pushedBatchSizes: number[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/sync/push')) {
        const request = JSON.parse(String(init?.body)) as {
          operations: Array<{
            operationId: string;
            entityId: string;
            entityType: 'apiary';
            payload: Record<string, unknown>;
          }>;
        };
        pushedBatchSizes.push(request.operations.length);
        const timestamp = new Date().toISOString();
        return Response.json({
          results: request.operations.map((operation) => ({
            operationId: operation.operationId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            status: 'accepted',
            serverValue: {
              id: operation.entityId,
              organizationId,
              ...operation.payload,
              version: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
            },
          })),
        });
      }
      return Response.json({ changes: [], nextCursor: '0', hasMore: false });
    });

    await synchronize(organizationId, 'csrf');

    expect(pushedBatchSizes).toEqual([100, 1]);
    expect(await db.outbox.count()).toBe(0);
  });

  it('rejects an incomplete push response without duplicating concurrent retries', async () => {
    const organizationId = crypto.randomUUID();
    const id = await queueCreate(organizationId, 'apiary', { name: 'Safe local copy' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ results: [] }));

    await expect(synchronize(organizationId, 'csrf')).rejects.toThrow(
      'incomplete synchronization result',
    );

    expect((await db.resources.get(`${organizationId}:apiary:${id}`))?.syncState).toBe('pending');
    expect((await db.outbox.toArray())[0]?.attempts).toBe(1);
  });

  it('pulls every available page with an organization-scoped cursor', async () => {
    const firstOrganization = crypto.randomUUID();
    const secondOrganization = crypto.randomUUID();
    const conflictedId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    await db.resources.put({
      key: `${firstOrganization}:apiary:${conflictedId}`,
      id: conflictedId,
      organizationId: firstOrganization,
      entityType: 'apiary',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      syncState: 'conflicted',
      data: { name: 'Keep this local conflict' },
    });
    const requestedCursors: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://apiarylens.test');
      const cursor = url.searchParams.get('cursor') ?? 'missing';
      requestedCursors.push(cursor);
      if (requestedCursors.length === 1) {
        return Response.json({
          changes: [
            {
              entityType: 'apiary',
              entityId: conflictedId,
              action: 'delete',
              value: null,
            },
          ],
          nextCursor: '4',
          hasMore: true,
        });
      }
      if (requestedCursors.length === 2) {
        return Response.json({ changes: [], nextCursor: '9', hasMore: false });
      }
      return Response.json({ changes: [], nextCursor: cursor, hasMore: false });
    });

    await synchronize(firstOrganization, 'csrf');
    await synchronize(secondOrganization, 'csrf');
    await synchronize(firstOrganization, 'csrf');

    expect(requestedCursors).toEqual(['0', '4', '0', '9']);
    expect((await db.settings.get(`syncCursor:${firstOrganization}`))?.value).toBe('9');
    expect((await db.settings.get(`syncCursor:${secondOrganization}`))?.value).toBe('0');
    expect((await db.resources.get(`${firstOrganization}:apiary:${conflictedId}`))?.data.name).toBe(
      'Keep this local conflict',
    );
  });
});
