import { describe, expect, it } from 'vitest';
import { recordKey, serverRecord } from './server-record.js';

describe('server record mapping', () => {
  it('builds organization-scoped record keys', () => {
    expect(recordKey('org-1', 'hive', 'hive-1')).toBe('org-1:hive:hive-1');
  });

  it('maps a server value to a synchronized local record without envelope fields', () => {
    const record = serverRecord('apiary', {
      id: 'apiary-1',
      organizationId: 'org-1',
      version: 3,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
      deletedAt: null,
      name: 'Back field',
      notes: 'Windbreak',
    });

    expect(record).toEqual({
      key: 'org-1:apiary:apiary-1',
      id: 'apiary-1',
      organizationId: 'org-1',
      entityType: 'apiary',
      version: 3,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
      deletedAt: null,
      syncState: 'synchronized',
      data: { name: 'Back field', notes: 'Windbreak' },
    });
  });

  it('preserves deletion timestamps', () => {
    const record = serverRecord('hive', {
      id: 'hive-1',
      organizationId: 'org-1',
      version: 2,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
      deletedAt: '2026-07-03T00:00:00.000Z',
      name: 'Hive 4',
    });
    expect(record.deletedAt).toBe('2026-07-03T00:00:00.000Z');
  });
});
