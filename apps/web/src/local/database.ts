import Dexie, { type EntityTable } from 'dexie';
import type { LocalMedia, LocalResource, OutboxItem, Setting } from './types.js';

export const LOCAL_CHANGE_EVENT = 'apiarylens:local-change';

export function announceLocalChange(): void {
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

export async function clientId(): Promise<string> {
  const current = (await db.settings.get('clientId'))?.value;
  if (typeof current === 'string') return current;
  const created = crypto.randomUUID();
  await db.settings.put({ key: 'clientId', value: created });
  return created;
}
