import { describe, expect, it } from 'vitest';
import {
  MIGRATION_CONTRACT_VERSION,
  migrationInventoryItemSchema,
  migrationReceiptSchema,
} from './migration.js';

describe('standalone migration contracts', () => {
  it('accepts a bounded secret-free inventory identity', () => {
    expect(
      migrationInventoryItemSchema.parse({
        schemaVersion: MIGRATION_CONTRACT_VERSION,
        migrationId: crypto.randomUUID(),
        itemId: `record:apiary:${crypto.randomUUID()}`,
        kind: 'record',
        entityType: 'apiary',
        entityId: crypto.randomUUID(),
        sha256: 'a'.repeat(64),
        bytes: 120,
        deleted: false,
      }),
    ).toMatchObject({ kind: 'record', entityType: 'apiary' });
  });

  it('rejects credentials and unversioned or mismatched receipts', () => {
    const migrationId = crypto.randomUUID();
    expect(() =>
      migrationInventoryItemSchema.parse({
        schemaVersion: MIGRATION_CONTRACT_VERSION,
        migrationId,
        itemId: `record:apiary:${crypto.randomUUID()}`,
        kind: 'record',
        entityType: 'apiary',
        entityId: crypto.randomUUID(),
        sha256: 'b'.repeat(64),
        bytes: 1,
        deleted: false,
        password: 'must-not-be-accepted',
      }),
    ).toThrow();
    expect(() =>
      migrationReceiptSchema.parse({
        schemaVersion: 2,
        migrationId,
        itemId: 'record:apiary:item',
        sha256: 'c'.repeat(64),
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
