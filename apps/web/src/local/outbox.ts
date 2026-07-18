import { resourceFieldSchemas, type ResourceType, type SyncOperation } from '@apiarylens/contracts';
import { recordKey, serverRecord } from '../core/server-record.js';
import { announceLocalChange, clientId, db } from './database.js';
import type { LocalResource } from './types.js';

export async function queueCreate(
  organizationId: string,
  entityType: ResourceType,
  fields: Record<string, unknown>,
): Promise<string> {
  const payload = resourceFieldSchemas[entityType].parse(fields);
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const operation: SyncOperation = {
    operationId: crypto.randomUUID(),
    clientId: await clientId(),
    entityType,
    entityId: id,
    action: 'create',
    baseVersion: 0,
    payload,
    queuedAt: timestamp,
  };
  await db.transaction('rw', db.resources, db.outbox, async () => {
    await db.resources.put({
      key: recordKey(organizationId, entityType, id),
      id,
      organizationId,
      entityType,
      version: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      syncState: 'pending',
      data: payload,
    });
    await db.outbox.put({
      ...operation,
      key: operation.operationId,
      organizationId,
      attempts: 0,
    });
  });
  announceLocalChange();
  return id;
}

export async function queueUpdate(
  record: LocalResource,
  fields: Record<string, unknown>,
): Promise<void> {
  const payload = resourceFieldSchemas[record.entityType].parse({ ...record.data, ...fields });
  const timestamp = new Date().toISOString();
  const operationClientId = await clientId();
  await db.transaction('rw', db.resources, db.outbox, async () => {
    if (record.syncState === 'failed') {
      const rejected = await db.outbox.where('entityId').equals(record.id).toArray();
      await db.outbox.bulkDelete(rejected.map((item) => item.key));
    }
    if (record.version === 0) {
      let pendingCreate = await db.outbox
        .where('entityId')
        .equals(record.id)
        .filter((item) => item.action === 'create')
        .first();
      if (!pendingCreate && record.syncState === 'failed') {
        const operation: SyncOperation = {
          operationId: crypto.randomUUID(),
          clientId: operationClientId,
          entityType: record.entityType,
          entityId: record.id,
          action: 'create',
          baseVersion: 0,
          payload,
          queuedAt: timestamp,
        };
        pendingCreate = {
          ...operation,
          key: operation.operationId,
          organizationId: record.organizationId,
          attempts: 0,
        };
        await db.outbox.put(pendingCreate);
      }
      if (!pendingCreate) throw new Error('The local create operation is missing');
      await db.outbox.update(pendingCreate.key, { payload });
    } else {
      const operation: SyncOperation = {
        operationId: crypto.randomUUID(),
        clientId: operationClientId,
        entityType: record.entityType,
        entityId: record.id,
        action: 'update',
        baseVersion: record.version,
        payload,
        queuedAt: timestamp,
      };
      await db.outbox.put({
        ...operation,
        key: operation.operationId,
        organizationId: record.organizationId,
        attempts: 0,
      });
    }
    await db.resources.update(record.key, {
      data: payload,
      updatedAt: timestamp,
      syncState: 'pending',
    });
  });
  announceLocalChange();
}

export async function queueDelete(record: LocalResource): Promise<void> {
  const pending = await db.outbox.where('entityId').equals(record.id).toArray();
  const deletionClientId = record.version === 0 ? undefined : await clientId();
  await db.transaction('rw', db.resources, db.outbox, db.media, async () => {
    if (record.version === 0) {
      await db.outbox.bulkDelete(pending.map((item) => item.key));
      await db.resources.delete(record.key);
      if (record.entityType === 'mediaAsset') await db.media.delete(record.id);
      return;
    }
    const operation: SyncOperation = {
      operationId: crypto.randomUUID(),
      clientId: deletionClientId!,
      entityType: record.entityType,
      entityId: record.id,
      action: 'delete',
      baseVersion: record.version,
      payload: null,
      queuedAt: new Date().toISOString(),
    };
    await db.outbox.bulkDelete(pending.map((item) => item.key));
    await db.outbox.put({
      ...operation,
      key: operation.operationId,
      organizationId: record.organizationId,
      attempts: 0,
    });
    await db.resources.update(record.key, { syncState: 'pending', deletedAt: operation.queuedAt });
    if (record.entityType === 'mediaAsset') await db.media.delete(record.id);
  });
  announceLocalChange();
}

export async function resolveConflict(
  record: LocalResource,
  choice: 'server' | 'local',
): Promise<void> {
  if (!record.conflict) throw new Error('Conflict details are unavailable');
  const server = serverRecord(record.entityType, record.conflict.serverValue);
  const pending = await db.outbox.where('entityId').equals(record.id).toArray();
  if (choice === 'server') {
    await db.transaction('rw', db.resources, db.outbox, async () => {
      await db.resources.put(server);
      await db.outbox.bulkDelete(pending.map((item) => item.key));
    });
    announceLocalChange();
    return;
  }
  const payload = resourceFieldSchemas[record.entityType].parse(record.conflict.clientValue);
  const timestamp = new Date().toISOString();
  const operation: SyncOperation = {
    operationId: crypto.randomUUID(),
    clientId: await clientId(),
    entityType: record.entityType,
    entityId: record.id,
    action: 'update',
    baseVersion: server.version,
    payload,
    queuedAt: timestamp,
  };
  await db.transaction('rw', db.resources, db.outbox, async () => {
    await db.outbox.bulkDelete(pending.map((item) => item.key));
    await db.outbox.put({
      ...operation,
      key: operation.operationId,
      organizationId: record.organizationId,
      attempts: 0,
    });
    await db.resources.put({
      ...server,
      data: payload,
      updatedAt: timestamp,
      syncState: 'pending',
    });
  });
  announceLocalChange();
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

export async function stageImage(
  organizationId: string,
  hiveId: string,
  inspectionId: string,
  file: File,
  caption?: string,
): Promise<string> {
  const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!supported.includes(file.type))
    throw new Error(`${file.name} is not a supported image format.`);
  if (file.size === 0 || file.size > 25 * 1024 * 1024) {
    throw new Error(`${file.name} must be between 1 byte and 25 MB.`);
  }
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
  )
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const payload = resourceFieldSchemas.mediaAsset.parse({
    hiveId,
    inspectionId,
    fileName: file.name,
    mediaType: file.type,
    byteSize: file.size,
    sha256: digest,
    caption,
    state: 'staged',
  });
  const operation: SyncOperation = {
    operationId: crypto.randomUUID(),
    clientId: await clientId(),
    entityType: 'mediaAsset',
    entityId: id,
    action: 'create',
    baseVersion: 0,
    payload,
    queuedAt: timestamp,
  };
  const thumbnail = await createThumbnail(file).catch(() => undefined);
  await db.transaction('rw', db.resources, db.outbox, db.media, async () => {
    await db.resources.put({
      key: recordKey(organizationId, 'mediaAsset', id),
      id,
      organizationId,
      entityType: 'mediaAsset',
      version: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      syncState: 'pending',
      data: payload,
    });
    await db.outbox.put({
      ...operation,
      key: operation.operationId,
      organizationId,
      attempts: 0,
    });
    await db.media.put({
      id,
      organizationId,
      blob: file,
      ...(thumbnail ? { thumbnail } : {}),
      state: 'staged',
    });
  });
  announceLocalChange();
  return id;
}

async function createThumbnail(file: File): Promise<Blob | undefined> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return undefined;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | undefined>((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.78),
    );
  } finally {
    bitmap.close();
  }
}
