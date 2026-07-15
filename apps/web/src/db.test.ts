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
} from './db.js';

describe('offline workspace', () => {
  afterEach(async () => {
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
});
