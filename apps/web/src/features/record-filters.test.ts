import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../db.js';
import {
  filterCareRecords,
  filterHivesByStatus,
  filterInspectionsByHive,
  filterRecordsByHive,
} from './record-filters.js';

function record(
  entityType: LocalResource['entityType'],
  data: Record<string, unknown>,
  id = crypto.randomUUID(),
) {
  return {
    key: `org:${entityType}:${id}`,
    id,
    organizationId: 'org',
    entityType,
    version: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    deletedAt: null,
    syncState: 'synchronized',
    data,
  } satisfies LocalResource;
}

describe('overview navigation filters', () => {
  it('filters hives to active or archived while keeping all by default', () => {
    const active = record('hive', { status: 'active' });
    const lost = record('hive', { status: 'lost' });
    const archived = record('hive', { status: 'archived', archivedAt: '2026-07-01' });
    const hives = [active, lost, archived];
    expect(filterHivesByStatus(hives, 'all')).toEqual(hives);
    expect(filterHivesByStatus(hives, 'active')).toEqual([active]);
    expect(filterHivesByStatus(hives, 'archived')).toEqual([archived]);
  });

  it('filters care records to open follow-ups only', () => {
    const open = record('followUp', { description: 'Add a super', completedAt: null });
    const done = record('followUp', { description: 'Feed', completedAt: '2026-07-09' });
    const feeding = record('feedingEvent', { feedType: '2:1 syrup' });
    const records = [open, done, feeding];
    expect(filterCareRecords(records, 'all')).toEqual(records);
    expect(filterCareRecords(records, 'open-follow-ups')).toEqual([open]);
  });

  it('filters inspections to one hive', () => {
    const first = record('inspection', { hiveId: 'hive-1', state: 'complete' });
    const second = record('inspection', { hiveId: 'hive-2', state: 'draft' });
    expect(filterInspectionsByHive([first, second], 'all')).toEqual([first, second]);
    expect(filterInspectionsByHive([first, second], 'hive-2')).toEqual([second]);
  });

  it('scopes care records to one hive so a hive-detail tile lands on its own list', () => {
    const mine = record('followUp', {
      hiveId: 'hive-1',
      description: 'Pull super',
      completedAt: null,
    });
    const other = record('followUp', {
      hiveId: 'hive-2',
      description: 'Requeen',
      completedAt: null,
    });
    const records = [mine, other];
    expect(filterRecordsByHive(records, 'all')).toEqual(records);
    expect(filterRecordsByHive(filterCareRecords(records, 'open-follow-ups'), 'hive-1')).toEqual([
      mine,
    ]);
  });
});
