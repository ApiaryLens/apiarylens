import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../../db.js';
import {
  currentQueen,
  filterHiveInspections,
  inspectionRangeLabel,
  inspectorNames,
  queenMark,
} from './hive-detail-data.js';

let sequence = 0;
function resource(
  entityType: LocalResource['entityType'],
  data: Record<string, unknown>,
): LocalResource {
  sequence += 1;
  return {
    key: `key-${sequence}`,
    id: `id-${sequence}`,
    organizationId: 'org-1',
    entityType,
    version: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    syncState: 'synchronized',
    data,
  };
}

const now = new Date('2026-07-18T12:00:00Z');
const inspections = [
  resource('inspection', {
    hiveId: 'h1',
    inspectedAt: '2026-07-14T09:05:00Z',
    inspectorName: 'Kris',
  }),
  resource('inspection', {
    hiveId: 'h1',
    inspectedAt: '2026-03-02T10:00:00Z',
    inspectorName: 'Sam',
  }),
  resource('inspection', {
    hiveId: 'h1',
    inspectedAt: '2025-09-20T10:00:00Z',
    inspectorName: 'Kris',
  }),
  resource('inspection', {
    hiveId: 'h2',
    inspectedAt: '2026-07-05T10:00:00Z',
    inspectorName: 'Rowan',
  }),
];

describe('hive detail inspection filters', () => {
  it('filters to the current season, newest first', () => {
    const visible = filterHiveInspections(
      inspections,
      'h1',
      { range: 'season', inspector: 'all' },
      now,
    );
    expect(visible.map((record) => String(record.data.inspectedAt).slice(0, 10))).toEqual([
      '2026-07-14',
      '2026-03-02',
    ]);
  });

  it('filters to the last 90 days', () => {
    const visible = filterHiveInspections(
      inspections,
      'h1',
      { range: '90d', inspector: 'all' },
      now,
    );
    expect(visible).toHaveLength(1);
    expect(String(visible[0]?.data.inspectedAt)).toContain('2026-07-14');
  });

  it('filters by inspector and shows everything under "all"', () => {
    expect(
      filterHiveInspections(inspections, 'h1', { range: 'all', inspector: 'Sam' }, now),
    ).toHaveLength(1);
    expect(
      filterHiveInspections(inspections, 'h1', { range: 'all', inspector: 'all' }, now),
    ).toHaveLength(3);
  });

  it('lists distinct inspectors for the filter row', () => {
    expect(inspectorNames(inspections, 'h1')).toEqual(['Kris', 'Sam']);
    expect(inspectorNames(inspections, 'h3')).toEqual([]);
  });

  it('labels ranges for the filter chips', () => {
    expect(inspectionRangeLabel('season', 2026)).toBe('2026 season');
    expect(inspectionRangeLabel('90d', 2026)).toBe('Last 90 days');
    expect(inspectionRangeLabel('all', 2026)).toBe('All time');
  });
});

describe('queen selection and marking', () => {
  it('selects the current queen with the newest introduction', () => {
    const superseded = resource('queen', {
      hiveId: 'h1',
      identifier: 'Anne I',
      status: 'superseded',
      introductionDate: '2024-04-01',
    });
    const current = resource('queen', {
      hiveId: 'h1',
      identifier: 'Anne II',
      status: 'current',
      introductionDate: '2025-04-12',
    });
    expect(currentQueen([superseded, current], 'h1')).toBe(current);
    expect(currentQueen([superseded], 'h2')).toBeUndefined();
  });

  it('uses the recorded mark color when present', () => {
    expect(queenMark({ marked: true, markColor: 'blue' })).toMatchObject({
      color: 'blue',
      label: 'marked blue',
    });
  });

  it('falls back to the international year code', () => {
    expect(queenMark({ marked: true, year: 2025 })).toMatchObject({
      color: 'blue',
      label: 'marked blue (2025 code)',
    });
    expect(queenMark({ marked: true, year: 2026 })).toMatchObject({ color: 'white' });
  });

  it('never invents a mark for unmarked or unknown queens', () => {
    expect(queenMark({ marked: false, year: 2025 })).toBeUndefined();
    expect(queenMark({ marked: true })).toBeUndefined();
  });
});
