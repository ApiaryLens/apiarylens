import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MIGRATION_CONTRACT_VERSION,
  MIGRATION_RECORD_BATCH_LIMIT,
  migrationInventoryItemSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type MigrationCompletion,
  type MigrationInventoryItem,
  type MigrationPhase,
  type MigrationReceipt,
  type ResourceType,
  type SyncOperation,
  type SyncOperationResult,
} from '@apiarylens/contracts';
import { SqliteStore, type ResourceRecord } from '@apiarylens/database';
import type { MediaStore } from '@apiarylens/media';
import type { WindowsConnectionProfile } from './connected-profile.js';

type InventoryRecord = MigrationInventoryItem & {
  kind: 'record';
  fields: Record<string, unknown>;
};
type InventoryMedia = MigrationInventoryItem & {
  kind: 'media';
  bytesValue: Uint8Array;
  contentType: string;
};
export type StandaloneMigrationInventory = {
  migrationId: string;
  organizationId: string;
  sha256: string;
  items: Array<InventoryRecord | InventoryMedia>;
};

export type MigrationTarget = {
  preflight(): Promise<{ organizationId: string; cursor: string }>;
  importRecords(items: readonly InventoryRecord[]): Promise<MigrationReceipt[]>;
  importMedia(item: InventoryMedia): Promise<MigrationReceipt>;
  reconcile(items: readonly (InventoryRecord | InventoryMedia)[]): Promise<Map<string, string>>;
  cursor(): Promise<string>;
};

export type MigrationState = {
  migrationId: string;
  phase: MigrationPhase;
  authority: 'standalone' | 'connected';
  sourceOrganizationId: string;
  targetOrganizationId?: string;
  inventorySha256?: string;
  backupSha256?: string;
  cutoverCursor?: string;
  profileId?: string;
  createdAt: string;
  updatedAt: string;
};

const phaseOrder: readonly MigrationPhase[] = [
  'preflight',
  'quiesced',
  'protected',
  'inventoried',
  'transferring',
  'reconciled',
  'cutover',
  'observing',
  'finalized',
];

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(',')}}`;
}

function fieldsOf(record: ResourceRecord): Record<string, unknown> {
  const {
    id: _id,
    organizationId: _organizationId,
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    ...fields
  } = record;
  return fields;
}

function recordDigest(
  entityType: ResourceType,
  entityId: string,
  fields: Record<string, unknown>,
  deleted: boolean,
): string {
  return sha256(
    canonical({ kind: 'record', entityType, entityId, fields: deleted ? null : fields, deleted }),
  );
}

function deterministicUuid(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateInventoryMetadata(item: InventoryRecord | InventoryMedia): void {
  migrationInventoryItemSchema.parse({
    schemaVersion: item.schemaVersion,
    migrationId: item.migrationId,
    itemId: item.itemId,
    kind: item.kind,
    entityType: item.entityType,
    entityId: item.entityId,
    ...(item.variant ? { variant: item.variant } : {}),
    sha256: item.sha256,
    bytes: item.bytes,
    deleted: item.deleted,
  });
}

export class SqliteMigrationJournal {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS migration_state (
        migration_id TEXT PRIMARY KEY,
        phase TEXT NOT NULL,
        authority TEXT NOT NULL CHECK(authority IN ('standalone','connected')),
        source_organization_id TEXT NOT NULL,
        target_organization_id TEXT,
        inventory_sha256 TEXT,
        backup_sha256 TEXT,
        cutover_cursor TEXT,
        profile_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS migration_items (
        migration_id TEXT NOT NULL REFERENCES migration_state(migration_id),
        item_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('record','media')),
        sha256 TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','accepted')),
        attempts INTEGER NOT NULL DEFAULT 0,
        receipt_sha256 TEXT,
        last_error_code TEXT,
        PRIMARY KEY(migration_id, item_id)
      );
    `);
  }

  start(sourceOrganizationId: string, migrationId: string = randomUUID()): MigrationState {
    const existing = this.read(migrationId);
    if (existing) return existing;
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO migration_state(
          migration_id, phase, authority, source_organization_id, created_at, updated_at
        ) VALUES (?, 'preflight', 'standalone', ?, ?, ?)`,
      )
      .run(migrationId, sourceOrganizationId, timestamp, timestamp);
    return this.readRequired(migrationId);
  }

  read(migrationId: string): MigrationState | undefined {
    const row = this.database
      .prepare('SELECT * FROM migration_state WHERE migration_id = ?')
      .get(migrationId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      migrationId: String(row.migration_id),
      phase: String(row.phase) as MigrationPhase,
      authority: String(row.authority) as 'standalone' | 'connected',
      sourceOrganizationId: String(row.source_organization_id),
      ...(row.target_organization_id
        ? { targetOrganizationId: String(row.target_organization_id) }
        : {}),
      ...(row.inventory_sha256 ? { inventorySha256: String(row.inventory_sha256) } : {}),
      ...(row.backup_sha256 ? { backupSha256: String(row.backup_sha256) } : {}),
      ...(row.cutover_cursor ? { cutoverCursor: String(row.cutover_cursor) } : {}),
      ...(row.profile_id ? { profileId: String(row.profile_id) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  advance(migrationId: string, phase: MigrationPhase, values: Partial<MigrationState> = {}): void {
    const state = this.readRequired(migrationId);
    const current = phaseOrder.indexOf(state.phase);
    const next = phaseOrder.indexOf(phase);
    if (phase !== 'rolled_back' && (next < current || next > current + 1)) {
      throw new Error(`Migration phase cannot move from ${state.phase} to ${phase}`);
    }
    if (
      phase !== 'rolled_back' &&
      state.authority === 'connected' &&
      phaseOrder.indexOf(phase) < phaseOrder.indexOf('cutover')
    ) {
      throw new Error('Connected authority cannot return to a pre-cutover phase');
    }
    this.database
      .prepare(
        `UPDATE migration_state SET phase = ?, authority = ?,
         target_organization_id = COALESCE(?, target_organization_id),
         inventory_sha256 = COALESCE(?, inventory_sha256),
         backup_sha256 = COALESCE(?, backup_sha256), cutover_cursor = COALESCE(?, cutover_cursor),
         profile_id = COALESCE(?, profile_id), updated_at = ? WHERE migration_id = ?`,
      )
      .run(
        phase,
        values.authority ?? state.authority,
        values.targetOrganizationId ?? null,
        values.inventorySha256 ?? null,
        values.backupSha256 ?? null,
        values.cutoverCursor ?? null,
        values.profileId ?? null,
        new Date().toISOString(),
        migrationId,
      );
  }

  inventory(migrationId: string, items: readonly MigrationInventoryItem[]): void {
    this.transaction(() => {
      const insert = this.database.prepare(
        `INSERT INTO migration_items(migration_id,item_id,kind,sha256,state)
         VALUES (?,?,?,?, 'pending')
         ON CONFLICT(migration_id,item_id) DO UPDATE SET
           kind=excluded.kind, sha256=excluded.sha256
         WHERE migration_items.state='pending' AND migration_items.sha256=excluded.sha256`,
      );
      for (const item of items) insert.run(migrationId, item.itemId, item.kind, item.sha256);
      const count = this.database
        .prepare('SELECT COUNT(*) AS count FROM migration_items WHERE migration_id=?')
        .get(migrationId) as { count: number };
      if (Number(count.count) !== items.length) throw new Error('Migration inventory changed');
      const mismatched = this.database.prepare(
        `SELECT COUNT(*) AS count FROM migration_items
           WHERE migration_id=? AND item_id=? AND sha256<>?`,
      );
      for (const item of items) {
        const row = mismatched.get(migrationId, item.itemId, item.sha256) as { count: number };
        if (Number(row.count) !== 0) throw new Error('Migration inventory hash changed');
      }
    });
  }

  pending(migrationId: string): Set<string> {
    return new Set(
      (
        this.database
          .prepare(
            "SELECT item_id FROM migration_items WHERE migration_id=? AND state='pending' ORDER BY item_id",
          )
          .all(migrationId) as Array<{ item_id: string }>
      ).map((row) => row.item_id),
    );
  }

  acceptBatch(migrationId: string, receipts: readonly MigrationReceipt[]): void {
    this.transaction(() => {
      const statement = this.database.prepare(
        `UPDATE migration_items SET state='accepted', attempts=attempts+1,
         receipt_sha256=?, last_error_code=NULL
         WHERE migration_id=? AND item_id=? AND sha256=?`,
      );
      for (const receipt of receipts) {
        const result = statement.run(
          sha256(canonical(receipt)),
          migrationId,
          receipt.itemId,
          receipt.sha256,
        );
        if (Number(result.changes) !== 1)
          throw new Error('Target receipt does not match inventory');
      }
    });
  }

  recordFailure(migrationId: string, itemIds: readonly string[], code: string): void {
    const safeCode = code.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80);
    this.transaction(() => {
      const statement = this.database.prepare(
        `UPDATE migration_items SET attempts=attempts+1,last_error_code=?
         WHERE migration_id=? AND item_id=? AND state='pending'`,
      );
      for (const itemId of itemIds) statement.run(safeCode, migrationId, itemId);
    });
  }

  stats(migrationId: string): { total: number; accepted: number; pending: number } {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) total, SUM(CASE WHEN state='accepted' THEN 1 ELSE 0 END) accepted
         FROM migration_items WHERE migration_id=?`,
      )
      .get(migrationId) as { total: number; accepted: number | null };
    const total = Number(row.total);
    const accepted = Number(row.accepted ?? 0);
    return { total, accepted, pending: total - accepted };
  }

  diagnostic(migrationId: string): Record<string, unknown> {
    const state = this.readRequired(migrationId);
    return {
      schemaVersion: MIGRATION_CONTRACT_VERSION,
      migrationId: state.migrationId,
      phase: state.phase,
      authority: state.authority,
      inventorySha256: state.inventorySha256,
      stats: this.stats(migrationId),
      updatedAt: state.updatedAt,
    };
  }

  close(): void {
    this.database.close();
  }

  private readRequired(migrationId: string): MigrationState {
    const state = this.read(migrationId);
    if (!state) throw new Error('Migration journal entry was not found');
    return state;
  }

  private transaction(work: () => void): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

export async function buildStandaloneInventory(input: {
  migrationId: string;
  source: SqliteStore;
  media: MediaStore;
  organizationId: string;
}): Promise<StandaloneMigrationInventory> {
  const rows = input.source.database
    .prepare(
      `SELECT entity_type, id, value_json, deleted_at FROM resources
       WHERE organization_id=? ORDER BY entity_type,id`,
    )
    .all(input.organizationId) as Array<{
    entity_type: ResourceType;
    id: string;
    value_json: string;
    deleted_at: string | null;
  }>;
  const items: Array<InventoryRecord | InventoryMedia> = [];
  for (const row of rows) {
    const record = JSON.parse(row.value_json) as ResourceRecord;
    const fields = fieldsOf(record);
    const deleted = row.deleted_at !== null;
    const item: InventoryRecord = {
      schemaVersion: MIGRATION_CONTRACT_VERSION,
      migrationId: input.migrationId,
      itemId: `record:${row.entity_type}:${row.id}`,
      kind: 'record',
      entityType: row.entity_type,
      entityId: row.id,
      sha256: recordDigest(row.entity_type, row.id, fields, deleted),
      bytes: Buffer.byteLength(canonical(fields)),
      deleted,
      fields,
    };
    validateInventoryMetadata(item);
    items.push(item);
    if (row.entity_type === 'mediaAsset' && !deleted) {
      for (const variant of ['original', 'thumbnail'] as const) {
        const bytes = await input.media.get(input.organizationId, row.id, variant);
        if (!bytes) continue;
        const mediaItem: InventoryMedia = {
          schemaVersion: MIGRATION_CONTRACT_VERSION,
          migrationId: input.migrationId,
          itemId: `media:${row.id}:${variant}`,
          kind: 'media',
          entityType: 'mediaAsset',
          entityId: row.id,
          variant,
          sha256: sha256(bytes),
          bytes: bytes.byteLength,
          deleted: false,
          bytesValue: bytes,
          contentType: variant === 'thumbnail' ? 'image/jpeg' : String(fields.mediaType),
        };
        validateInventoryMetadata(mediaItem);
        items.push(mediaItem);
      }
    }
  }
  const publicItems = items.map((item) => ({
    schemaVersion: item.schemaVersion,
    migrationId: item.migrationId,
    itemId: item.itemId,
    kind: item.kind,
    entityType: item.entityType,
    entityId: item.entityId,
    ...(item.variant ? { variant: item.variant } : {}),
    sha256: item.sha256,
    bytes: item.bytes,
    deleted: item.deleted,
  }));
  return {
    migrationId: input.migrationId,
    organizationId: input.organizationId,
    sha256: sha256(canonical(publicItems)),
    items,
  };
}

function operationFor(item: InventoryRecord, action: 'create' | 'delete'): SyncOperation {
  return {
    operationId: deterministicUuid(`${item.migrationId}:${item.itemId}:${action}`),
    clientId: item.migrationId,
    entityType: item.entityType,
    entityId: item.entityId,
    action,
    baseVersion: action === 'delete' ? 1 : 0,
    payload: action === 'create' ? item.fields : null,
    queuedAt: '2000-01-01T00:00:00.000Z',
  };
}

export class SqliteMigrationTarget implements MigrationTarget {
  constructor(
    private readonly store: SqliteStore,
    private readonly media: MediaStore,
    private readonly organizationId: string,
    private readonly actorUserId: string,
  ) {}

  async preflight(): Promise<{ organizationId: string; cursor: string }> {
    const organization = this.store.database
      .prepare('SELECT id FROM organizations WHERE id=? AND deleted_at IS NULL')
      .get(this.organizationId);
    if (!organization) throw new Error('Target organization is unavailable');
    return { organizationId: this.organizationId, cursor: await this.cursor() };
  }

  async importRecords(items: readonly InventoryRecord[]): Promise<MigrationReceipt[]> {
    if (items.length < 1 || items.length > MIGRATION_RECORD_BATCH_LIMIT)
      throw new Error('Migration record batch is outside the supported bound');
    const receipts: MigrationReceipt[] = [];
    const work = items.map((item) => ({
      item,
      operations: [
        operationFor(item, 'create'),
        ...(item.deleted ? [operationFor(item, 'delete')] : []),
      ],
    }));
    const operations = work.flatMap((entry) => entry.operations);
    const results: SyncOperationResult[] = [];
    for (let offset = 0; offset < operations.length; offset += MIGRATION_RECORD_BATCH_LIMIT) {
      results.push(
        ...this.store.applyOperations(
          this.organizationId,
          this.actorUserId,
          operations.slice(offset, offset + MIGRATION_RECORD_BATCH_LIMIT),
        ),
      );
    }
    let resultOffset = 0;
    for (const { item, operations: itemOperations } of work) {
      const itemResults = results.slice(resultOffset, resultOffset + itemOperations.length);
      resultOffset += itemOperations.length;
      for (const result of itemResults) {
        if (result.status !== 'accepted' && result.status !== 'duplicate') {
          throw new Error(`migration_${result.status}:${item.itemId}`);
        }
      }
      receipts.push({
        schemaVersion: MIGRATION_CONTRACT_VERSION,
        migrationId: item.migrationId,
        itemId: item.itemId,
        sha256: item.sha256,
        status: itemResults.every((result) => result.status === 'duplicate')
          ? 'duplicate'
          : 'accepted',
        acceptedAt: new Date().toISOString(),
      });
    }
    return receipts;
  }

  async importMedia(item: InventoryMedia): Promise<MigrationReceipt> {
    const existing = await this.media.get(this.organizationId, item.entityId, item.variant);
    if (!existing || sha256(existing) !== item.sha256) {
      await this.media.put(this.organizationId, item.entityId, item.bytesValue, item.variant);
    }
    const verified = await this.media.get(this.organizationId, item.entityId, item.variant);
    if (!verified || sha256(verified) !== item.sha256) throw new Error('migration_media_integrity');
    return {
      schemaVersion: MIGRATION_CONTRACT_VERSION,
      migrationId: item.migrationId,
      itemId: item.itemId,
      sha256: item.sha256,
      status: existing ? 'duplicate' : 'accepted',
      acceptedAt: new Date().toISOString(),
    };
  }

  async reconcile(
    items: readonly (InventoryRecord | InventoryMedia)[],
  ): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    for (const item of items) {
      if (item.kind === 'record') {
        const target = this.store.getResource(this.organizationId, item.entityType, item.entityId);
        if (target)
          hashes.set(
            item.itemId,
            recordDigest(
              item.entityType,
              item.entityId,
              fieldsOf(target),
              Boolean(target.deletedAt),
            ),
          );
      } else {
        const bytes = await this.media.get(this.organizationId, item.entityId, item.variant);
        if (bytes) hashes.set(item.itemId, sha256(bytes));
      }
    }
    return hashes;
  }

  async cursor(): Promise<string> {
    const row = this.store.database
      .prepare('SELECT COALESCE(MAX(sequence),0) AS cursor FROM changes WHERE organization_id=?')
      .get(this.organizationId) as { cursor: number };
    return String(row.cursor);
  }
}

export class HttpMigrationTarget implements MigrationTarget {
  private csrfToken = '';
  private organizationId = '';
  private lastCursor = '0';

  constructor(
    private readonly profile: WindowsConnectionProfile,
    private readonly request: typeof fetch = fetch,
  ) {}

  async preflight(): Promise<{ organizationId: string; cursor: string }> {
    const health = await this.request(`${this.profile.backendUrl}/health`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (!health.ok || new URL(health.url).origin !== this.profile.backendUrl)
      throw new Error('Connected migration target health failed');
    const session = await this.request(`${this.profile.backendUrl}/api/v1/session`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await session.json().catch(() => undefined)) as
      | {
          csrfToken?: unknown;
          organization?: { id?: unknown };
          membership?: { role?: unknown };
        }
      | undefined;
    if (
      !session.ok ||
      body?.membership?.role !== 'owner' ||
      typeof body.csrfToken !== 'string' ||
      typeof body.organization?.id !== 'string'
    ) {
      throw new Error('A signed-in target owner is required for migration');
    }
    this.csrfToken = body.csrfToken;
    this.organizationId = body.organization.id;
    this.lastCursor = await this.cursor();
    return { organizationId: this.organizationId, cursor: this.lastCursor };
  }

  async importRecords(items: readonly InventoryRecord[]): Promise<MigrationReceipt[]> {
    if (!this.csrfToken) throw new Error('Migration target preflight has not completed');
    if (items.length < 1 || items.length > MIGRATION_RECORD_BATCH_LIMIT)
      throw new Error('Migration record batch is outside the supported bound');
    const work = items.map((item) => ({
      item,
      operations: [
        operationFor(item, 'create'),
        ...(item.deleted ? [operationFor(item, 'delete')] : []),
      ],
    }));
    const operations = work.flatMap((entry) => entry.operations);
    const results: SyncOperationResult[] = [];
    for (let offset = 0; offset < operations.length; offset += MIGRATION_RECORD_BATCH_LIMIT) {
      const response = await this.request(`${this.profile.backendUrl}/api/v1/sync/push`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
        body: JSON.stringify({
          syncContractVersion: 1,
          operations: operations.slice(offset, offset + MIGRATION_RECORD_BATCH_LIMIT),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Migration record import failed (${response.status})`);
      results.push(...syncPushResponseSchema.parse(await response.json()).results);
    }
    let offset = 0;
    return work.map(({ item, operations: itemOperations }) => {
      const itemResults = results.slice(offset, offset + itemOperations.length);
      offset += itemOperations.length;
      if (
        itemResults.length !== itemOperations.length ||
        itemResults.some((result) => !['accepted', 'duplicate'].includes(result.status))
      ) {
        throw new Error(`Migration target rejected ${item.itemId}`);
      }
      return {
        schemaVersion: MIGRATION_CONTRACT_VERSION,
        migrationId: item.migrationId,
        itemId: item.itemId,
        sha256: item.sha256,
        status: itemResults.every((result) => result.status === 'duplicate')
          ? 'duplicate'
          : 'accepted',
        acceptedAt: new Date().toISOString(),
      };
    });
  }

  async importMedia(item: InventoryMedia): Promise<MigrationReceipt> {
    if (!this.csrfToken) throw new Error('Migration target preflight has not completed');
    const suffix = item.variant === 'thumbnail' ? 'thumbnail' : 'content';
    const response = await this.request(
      `${this.profile.backendUrl}/api/v1/media/${item.entityId}/${suffix}`,
      {
        method: 'PUT',
        redirect: 'error',
        headers: { 'content-type': item.contentType, 'x-csrf-token': this.csrfToken },
        body: item.bytesValue.slice().buffer as ArrayBuffer,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) throw new Error(`Migration media import failed (${response.status})`);
    return {
      schemaVersion: MIGRATION_CONTRACT_VERSION,
      migrationId: item.migrationId,
      itemId: item.itemId,
      sha256: item.sha256,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
    };
  }

  async reconcile(
    items: readonly (InventoryRecord | InventoryMedia)[],
  ): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    let cursor = '0';
    const current = new Map<string, { value: Record<string, unknown> | null; deleted: boolean }>();
    do {
      const page = await this.pull(cursor);
      for (const change of page.changes) {
        current.set(`record:${change.entityType}:${change.entityId}`, {
          value: change.value,
          deleted: change.action === 'delete',
        });
      }
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    } while (true);
    this.lastCursor = cursor;
    for (const item of items) {
      if (item.kind === 'record') {
        const value = current.get(item.itemId);
        if (!value) continue;
        hashes.set(
          item.itemId,
          recordDigest(
            item.entityType,
            item.entityId,
            value.value ? fieldsOf(value.value as ResourceRecord) : {},
            value.deleted,
          ),
        );
      } else {
        const variant = item.variant === 'thumbnail' ? '?variant=thumbnail' : '';
        const response = await this.request(
          `${this.profile.backendUrl}/api/v1/media/${item.entityId}/content${variant}`,
          { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60_000) },
        );
        if (response.ok)
          hashes.set(item.itemId, sha256(new Uint8Array(await response.arrayBuffer())));
      }
    }
    return hashes;
  }

  async cursor(): Promise<string> {
    let cursor = '0';
    do {
      const page = await this.pull(cursor);
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    } while (true);
    this.lastCursor = cursor;
    return cursor;
  }

  private async pull(cursor: string) {
    const response = await this.request(
      `${this.profile.backendUrl}/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=250`,
      { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok)
      throw new Error(`Migration target reconciliation failed (${response.status})`);
    return syncPullResponseSchema.parse(await response.json());
  }
}

export async function runStandaloneToConnectedMigration(input: {
  journal: SqliteMigrationJournal;
  migrationId?: string;
  sourceOrganizationId: string;
  source: SqliteStore;
  sourceMedia: MediaStore;
  target: MigrationTarget;
  profile: WindowsConnectionProfile;
  backupPath: string;
  createVerifiedBackup(): Promise<void> | void;
  cutover(profile: WindowsConnectionProfile): Promise<void> | void;
  afterBatch?(accepted: number): Promise<void> | void;
}): Promise<MigrationCompletion> {
  let state = input.journal.start(input.sourceOrganizationId, input.migrationId);
  const migrationId = state.migrationId;
  const targetIdentity = await input.target.preflight();
  if (state.targetOrganizationId && state.targetOrganizationId !== targetIdentity.organizationId)
    throw new Error('Migration target organization changed');
  if (state.phase === 'preflight') {
    input.journal.advance(migrationId, 'quiesced', {
      targetOrganizationId: targetIdentity.organizationId,
    });
    state = input.journal.read(migrationId)!;
  }
  if (state.phase === 'quiesced') {
    await input.createVerifiedBackup();
    if (!existsSync(input.backupPath)) throw new Error('Verified migration backup is missing');
    input.journal.advance(migrationId, 'protected', {
      backupSha256: await sha256File(input.backupPath),
    });
    state = input.journal.read(migrationId)!;
  }
  const inventory = await buildStandaloneInventory({
    migrationId,
    source: input.source,
    media: input.sourceMedia,
    organizationId: input.sourceOrganizationId,
  });
  if (state.inventorySha256 && state.inventorySha256 !== inventory.sha256)
    throw new Error('Standalone source changed after migration protection');
  if (state.phase === 'protected') {
    input.journal.inventory(migrationId, inventory.items);
    input.journal.advance(migrationId, 'inventoried', { inventorySha256: inventory.sha256 });
    state = input.journal.read(migrationId)!;
  }
  if (state.phase === 'inventoried') {
    input.journal.advance(migrationId, 'transferring');
    state = input.journal.read(migrationId)!;
  }
  if (state.phase === 'transferring') {
    const pending = input.journal.pending(migrationId);
    const records = inventory.items.filter(
      (item): item is InventoryRecord => item.kind === 'record' && pending.has(item.itemId),
    );
    for (let offset = 0; offset < records.length; offset += MIGRATION_RECORD_BATCH_LIMIT) {
      const batch = records.slice(offset, offset + MIGRATION_RECORD_BATCH_LIMIT);
      try {
        const receipts = await input.target.importRecords(batch);
        input.journal.acceptBatch(migrationId, receipts);
        await input.afterBatch?.(input.journal.stats(migrationId).accepted);
      } catch (error) {
        input.journal.recordFailure(
          migrationId,
          batch.map((item) => item.itemId),
          'record_import',
        );
        throw error;
      }
    }
    for (const item of inventory.items) {
      if (item.kind !== 'media' || !input.journal.pending(migrationId).has(item.itemId)) continue;
      try {
        input.journal.acceptBatch(migrationId, [await input.target.importMedia(item)]);
        await input.afterBatch?.(input.journal.stats(migrationId).accepted);
      } catch (error) {
        input.journal.recordFailure(migrationId, [item.itemId], 'media_import');
        throw error;
      }
    }
    if (input.journal.stats(migrationId).pending !== 0)
      throw new Error('Migration transfer is incomplete');
    const targetHashes = await input.target.reconcile(inventory.items);
    for (const item of inventory.items) {
      if (targetHashes.get(item.itemId) !== item.sha256)
        throw new Error(`Migration reconciliation failed for ${item.itemId}`);
    }
    input.journal.advance(migrationId, 'reconciled');
    state = input.journal.read(migrationId)!;
  }
  if (state.phase === 'reconciled') {
    const finalCursor = await input.target.cursor();
    const cutoverProfile: WindowsConnectionProfile = {
      ...input.profile,
      migration: {
        migrationId,
        sourceOrganizationId: input.sourceOrganizationId,
        targetOrganizationId: targetIdentity.organizationId,
        inventorySha256: inventory.sha256,
        cutoverCursor: finalCursor,
      },
    };
    await input.cutover(cutoverProfile);
    input.journal.advance(migrationId, 'cutover', {
      authority: 'connected',
      cutoverCursor: finalCursor,
      profileId: input.profile.profileId,
    });
    input.journal.advance(migrationId, 'observing');
    state = input.journal.read(migrationId)!;
  }
  if (state.authority !== 'connected' || !state.cutoverCursor)
    throw new Error('Migration did not establish connected authority');
  return {
    schemaVersion: MIGRATION_CONTRACT_VERSION,
    migrationId,
    sourceOrganizationId: input.sourceOrganizationId,
    targetOrganizationId: targetIdentity.organizationId,
    inventorySha256: inventory.sha256,
    recordCount: inventory.items.filter((item) => item.kind === 'record').length,
    mediaCount: inventory.items.filter((item) => item.kind === 'media').length,
    finalCursor: state.cutoverCursor,
    completedAt: state.updatedAt,
  };
}

async function sha256File(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

export function recoverAuthorityCutover(
  journal: SqliteMigrationJournal,
  profile: WindowsConnectionProfile,
): void {
  const evidence = profile.migration;
  if (!evidence) return;
  const state = journal.read(evidence.migrationId);
  if (!state) throw new Error('Connected migration journal is missing');
  if (
    state.sourceOrganizationId !== evidence.sourceOrganizationId ||
    state.targetOrganizationId !== evidence.targetOrganizationId ||
    state.inventorySha256 !== evidence.inventorySha256 ||
    !state.targetOrganizationId
  ) {
    throw new Error('Connected authority evidence does not match the migration journal');
  }
  if (state.phase === 'reconciled' && state.authority === 'standalone') {
    journal.advance(evidence.migrationId, 'cutover', {
      authority: 'connected',
      cutoverCursor: evidence.cutoverCursor,
      profileId: profile.profileId,
    });
    journal.advance(evidence.migrationId, 'observing');
    return;
  }
  if (
    state.authority !== 'connected' ||
    !['cutover', 'observing', 'finalized'].includes(state.phase) ||
    state.cutoverCursor !== evidence.cutoverCursor ||
    state.profileId !== profile.profileId
  ) {
    throw new Error('Connected authority cutover is incomplete or inconsistent');
  }
}

export async function rollbackConnectedAuthority(input: {
  journal: SqliteMigrationJournal;
  migrationId: string;
  target: MigrationTarget;
  removeProfile(): Promise<void> | void;
}): Promise<void> {
  const state = input.journal.read(input.migrationId);
  if (
    !state ||
    state.authority !== 'connected' ||
    state.phase !== 'observing' ||
    !state.cutoverCursor
  )
    throw new Error('Migration is not eligible for authority rollback');
  if ((await input.target.cursor()) !== state.cutoverCursor)
    throw new Error('Remote-only writes block standalone authority rollback');
  await input.removeProfile();
  input.journal.advance(input.migrationId, 'rolled_back', { authority: 'standalone' });
}

export function journalContainsSecretLikeContent(path: string): boolean {
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8').toLowerCase();
  return ['password', 'sessiontoken', 'csrftoken', 'authorization', 'bearer '].some((term) =>
    text.includes(term),
  );
}

export type { InventoryMedia, InventoryRecord };
