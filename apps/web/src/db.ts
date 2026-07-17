import Dexie, { type EntityTable } from 'dexie';
import {
  resourceFieldSchemas,
  type ResourceType,
  type SessionView,
  type SyncOperation,
  type SyncOperationResult,
} from '@apiarylens/contracts';

export type SyncState =
  'local' | 'pending' | 'synchronizing' | 'synchronized' | 'conflicted' | 'failed';

export interface LocalResource {
  key: string;
  id: string;
  organizationId: string;
  entityType: ResourceType;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
  data: Record<string, unknown>;
  conflict?: {
    serverValue: Record<string, unknown>;
    clientValue: Record<string, unknown>;
  };
}

export interface OutboxItem extends SyncOperation {
  key: string;
  organizationId?: string;
  attempts: number;
  lastError?: string;
}

interface Setting {
  key: string;
  value: unknown;
}

export interface LocalMedia {
  id: string;
  organizationId: string;
  blob: Blob;
  thumbnail?: Blob;
  state: 'staged' | 'uploading' | 'ready' | 'failed';
  lastError?: string;
}

export const LOCAL_CHANGE_EVENT = 'apiarylens:local-change';

export class SyncRequestError extends Error {
  readonly retryable: boolean;

  constructor(
    operation: string,
    readonly status: number,
    message = `${operation} failed (${status})`,
  ) {
    super(message);
    this.name = 'SyncRequestError';
    this.retryable =
      status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
  }
}

export function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof SyncRequestError) return error.retryable;
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException)
    return error.name === 'AbortError' || error.name === 'NetworkError';
  return Boolean((error as { retryable?: boolean } | null)?.retryable);
}

export function requiresSessionRefresh(error: unknown): boolean {
  return error instanceof SyncRequestError && (error.status === 401 || error.status === 403);
}

function announceLocalChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

export class ApiaryLensDb extends Dexie {
  resources!: EntityTable<LocalResource, 'key'>;
  outbox!: EntityTable<OutboxItem, 'key'>;
  settings!: EntityTable<Setting, 'key'>;
  media!: EntityTable<LocalMedia, 'id'>;

  constructor(name = 'apiarylens') {
    super(name);
    this.version(1).stores({
      resources:
        '&key, organizationId, entityType, syncState, updatedAt, [organizationId+entityType]',
      outbox: '&key, operationId, entityId, queuedAt',
      settings: '&key',
    });
    this.version(2).stores({
      resources:
        '&key, organizationId, entityType, syncState, updatedAt, [organizationId+entityType]',
      outbox: '&key, operationId, entityId, queuedAt',
      settings: '&key',
      media: '&id, organizationId, state',
    });
    // Repair installs that reached a database version without materializing
    // the media store (for example, an interrupted service-worker upgrade).
    this.version(3).stores({
      resources:
        '&key, organizationId, entityType, syncState, updatedAt, [organizationId+entityType]',
      outbox: '&key, operationId, entityId, queuedAt',
      settings: '&key',
      media: '&id, organizationId, state',
    });
    this.version(4).stores({
      resources:
        '&key, organizationId, entityType, syncState, updatedAt, [organizationId+entityType]',
      outbox: '&key, operationId, organizationId, entityId, queuedAt',
      settings: '&key',
      media: '&id, organizationId, state',
    });
  }
}

export const db = new ApiaryLensDb();
const recordKey = (organizationId: string, entityType: ResourceType, id: string) =>
  `${organizationId}:${entityType}:${id}`;

export async function cacheSession(session: SessionView): Promise<void> {
  const { csrfToken: _csrfToken, ...offlineSession } = session;
  await db.settings.put({ key: 'session', value: offlineSession });
}

export async function cachedSession(): Promise<Omit<SessionView, 'csrfToken'> | undefined> {
  return (await db.settings.get('session'))?.value as Omit<SessionView, 'csrfToken'> | undefined;
}

export async function clearCachedSession(): Promise<void> {
  await db.settings.delete('session');
}

export async function clearLocalWorkspace(): Promise<void> {
  await db.transaction('rw', db.resources, db.outbox, db.settings, db.media, async () => {
    await Promise.all([
      db.resources.clear(),
      db.outbox.clear(),
      db.settings.clear(),
      db.media.clear(),
    ]);
  });
}

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

export async function synchronize(
  organizationId: string,
  csrfToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const candidates = await db.outbox.orderBy('queuedAt').toArray();
  const batch: OutboxItem[] = [];
  for (const item of candidates) {
    // Older Preview databases did not persist organizationId on the outbox
    // item. Resolve those operations through their organization-scoped local
    // record instead of ever submitting another family's queued work.
    const localRecord = await db.resources.get(
      recordKey(organizationId, item.entityType, item.entityId),
    );
    const belongsToOrganization =
      item.organizationId === organizationId ||
      (item.organizationId === undefined && localRecord !== undefined);
    if (belongsToOrganization && localRecord?.syncState !== 'failed') batch.push(item);
    if (batch.length === 100) break;
  }
  if (batch.length > 0) {
    await Promise.all(
      batch.map((item) =>
        db.resources.update(recordKey(organizationId, item.entityType, item.entityId), {
          syncState: 'synchronizing',
        }),
      ),
    );
    let results: SyncOperationResult[];
    try {
      const response = await fetch('/api/v1/sync/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ syncContractVersion: 1, operations: batch }),
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw new SyncRequestError('Push', response.status);
      const body = (await response.json()) as { results: SyncOperationResult[] };
      results = body.results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Synchronization failed';
      await db.transaction('rw', db.resources, db.outbox, async () => {
        for (const item of batch) {
          await db.outbox.update(item.key, { attempts: item.attempts + 1, lastError: message });
          await db.resources.update(recordKey(organizationId, item.entityType, item.entityId), {
            // A network, expired-session, throttling, or server outage leaves the
            // durable operation safely queued. "failed" is reserved for a
            // permanent server rejection that needs user attention.
            syncState: isRetryableSyncError(error) ? 'pending' : 'failed',
          });
        }
      });
      throw error;
    }
    const rejected = await applyPushResults(organizationId, results);
    if (rejected > 0) {
      throw new SyncRequestError(
        'Push operation',
        422,
        `${rejected} saved item${rejected === 1 ? '' : 's'} need attention before synchronizing.`,
      );
    }
  }

  await uploadStagedMedia(organizationId, csrfToken, signal);

  const cursor = ((await db.settings.get('syncCursor'))?.value as string | undefined) ?? '0';
  const pull = await fetch(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=250`, {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  if (!pull.ok) throw new SyncRequestError('Pull', pull.status);
  const body = (await pull.json()) as {
    changes: Array<{
      entityType: ResourceType;
      entityId: string;
      action: 'upsert' | 'delete';
      value: Record<string, unknown> | null;
    }>;
    nextCursor: string;
  };
  await db.transaction('rw', db.resources, db.settings, async () => {
    for (const change of body.changes) {
      const key = recordKey(organizationId, change.entityType, change.entityId);
      if (change.action === 'delete') {
        await db.resources.delete(key);
      } else if (change.value) {
        const current = await db.resources.get(key);
        if (current?.syncState !== 'conflicted') {
          await db.resources.put(serverRecord(change.entityType, change.value));
        }
      }
    }
    await db.settings.put({ key: 'syncCursor', value: body.nextCursor });
  });
}

async function uploadStagedMedia(
  organizationId: string,
  csrfToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const staged = await db.media
    .where('organizationId')
    .equals(organizationId)
    .filter((item) => item.state === 'staged' || item.state === 'failed')
    .toArray();
  for (const item of staged) {
    await db.media.update(item.id, { state: 'uploading', lastError: '' });
    try {
      const response = await fetch(`/api/v1/media/${item.id}/content`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': item.blob.type, 'x-csrf-token': csrfToken },
        body: item.blob,
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => undefined)) as
          { message?: string } | undefined;
        throw new SyncRequestError('Image upload', response.status, detail?.message);
      }
      const value = (await response.json()) as Record<string, unknown>;
      if (item.thumbnail) {
        const thumbnailResponse = await fetch(`/api/v1/media/${item.id}/thumbnail`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'image/jpeg', 'x-csrf-token': csrfToken },
          body: item.thumbnail,
          ...(signal ? { signal } : {}),
        });
        if (!thumbnailResponse.ok) {
          const detail = (await thumbnailResponse.json().catch(() => undefined)) as
            { message?: string } | undefined;
          throw new SyncRequestError('Thumbnail upload', thumbnailResponse.status, detail?.message);
        }
      }
      await db.transaction('rw', db.media, db.resources, async () => {
        await db.media.update(item.id, { state: 'ready', lastError: '' });
        if (typeof value.organizationId === 'string')
          await db.resources.put(serverRecord('mediaAsset', value));
        else {
          const key = recordKey(organizationId, 'mediaAsset', item.id);
          const current = await db.resources.get(key);
          if (current)
            await db.resources.put({
              ...current,
              syncState: 'synchronized',
              data: { ...current.data, state: 'ready' },
            });
        }
      });
    } catch (error) {
      await db.media.update(item.id, {
        state: isRetryableSyncError(error) ? 'staged' : 'failed',
        lastError: error instanceof Error ? error.message : 'Image upload failed',
      });
      throw error;
    }
  }
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

async function clientId(): Promise<string> {
  const current = (await db.settings.get('clientId'))?.value;
  if (typeof current === 'string') return current;
  const created = crypto.randomUUID();
  await db.settings.put({ key: 'clientId', value: created });
  return created;
}

function serverRecord(entityType: ResourceType, value: Record<string, unknown>): LocalResource {
  const organizationId = String(value.organizationId);
  const id = String(value.id);
  const {
    id: _id,
    organizationId: _organizationId,
    version,
    createdAt,
    updatedAt,
    deletedAt,
    ...data
  } = value;
  return {
    key: recordKey(organizationId, entityType, id),
    id,
    organizationId,
    entityType,
    version: Number(version),
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
    deletedAt: deletedAt === null ? null : String(deletedAt),
    syncState: 'synchronized',
    data,
  };
}

async function applyPushResults(
  organizationId: string,
  results: SyncOperationResult[],
): Promise<number> {
  let rejected = 0;
  await db.transaction('rw', db.resources, db.outbox, async () => {
    for (const result of results) {
      const key = recordKey(organizationId, result.entityType, result.entityId);
      if ((result.status === 'accepted' || result.status === 'duplicate') && result.serverValue) {
        await db.resources.put(serverRecord(result.entityType, result.serverValue));
        await db.outbox.delete(result.operationId);
      } else if (result.status === 'conflict') {
        if (result.serverValue && result.clientValue) {
          await db.resources.update(key, {
            syncState: 'conflicted',
            conflict: { serverValue: result.serverValue, clientValue: result.clientValue },
          });
        } else {
          await db.resources.update(key, { syncState: 'conflicted' });
        }
      } else {
        rejected += 1;
        await db.resources.update(key, { syncState: 'failed' });
        const operation = await db.outbox.get(result.operationId);
        if (operation) {
          await db.outbox.update(operation.key, {
            attempts: operation.attempts + 1,
            lastError: 'The server rejected this saved item.',
          });
        }
      }
    }
  });
  return rejected;
}
