import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../db.js';
import {
  activeTreatmentForHive,
  cumulativeMonthlySeries,
  formatMiteReading,
  hiveStatusTag,
  latestInspectionByHive,
  latestMiteByHive,
  miteSeriesForHive,
  seasonHarvest,
} from './board-data.js';

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

describe('hive status board selectors', () => {
  it('picks the newest inspection per hive', () => {
    const older = resource('inspection', { hiveId: 'h1', inspectedAt: '2026-06-01T10:00:00Z' });
    const newer = resource('inspection', { hiveId: 'h1', inspectedAt: '2026-07-14T09:05:00Z' });
    const other = resource('inspection', { hiveId: 'h2', inspectedAt: '2026-07-05T08:00:00Z' });
    const latest = latestInspectionByHive([older, newer, other]);
    expect(latest.get('h1')).toBe(newer);
    expect(latest.get('h2')).toBe(other);
  });

  it('reports mites per 100 bees only when a sample size was recorded', () => {
    const washed = resource('miteCount', {
      hiveId: 'h1',
      measuredAt: '2026-07-14T09:00:00Z',
      method: 'alcohol_wash',
      miteCount: 7,
      sampleSize: 300,
      resultPercent: (7 / 300) * 100,
    });
    const visual = resource('miteCount', {
      hiveId: 'h2',
      measuredAt: '2026-07-05T09:00:00Z',
      method: 'visual',
      miteCount: 4,
      sampleSize: null,
      resultPercent: null,
    });
    const latest = latestMiteByHive([washed, visual]);
    expect(latest.get('h1')?.per100).toBe(2.3);
    expect(formatMiteReading(latest.get('h1'))).toBe('2.3');
    expect(latest.get('h2')?.per100).toBeNull();
    expect(formatMiteReading(latest.get('h2'))).toBe('4 mites');
    expect(formatMiteReading(undefined)).toBe('—');
  });

  it('builds a chronological per-hive mite series', () => {
    const may = resource('miteCount', { hiveId: 'h1', measuredAt: '2026-05-16', miteCount: 2 });
    const july = resource('miteCount', { hiveId: 'h1', measuredAt: '2026-07-14', miteCount: 7 });
    const other = resource('miteCount', { hiveId: 'h2', measuredAt: '2026-06-01', miteCount: 1 });
    expect(miteSeriesForHive([july, other, may], 'h1').map((reading) => reading.count)).toEqual([
      2, 7,
    ]);
  });

  it('derives TREATING from an open treatment window, never from guesswork', () => {
    const hive = resource('hive', { name: 'Queen Anne', status: 'active' });
    const open = resource('treatmentEvent', {
      hiveId: hive.id,
      productOrMethod: 'Formic Pro',
      applicationDate: '2026-07-15',
      removalDate: '2026-07-29',
    });
    const closed = resource('treatmentEvent', {
      hiveId: hive.id,
      productOrMethod: 'Oxalic',
      applicationDate: '2026-01-02',
      removalDate: '2026-01-09',
    });
    expect(activeTreatmentForHive([closed], hive.id, '2026-07-18T00:00:00Z')).toBeUndefined();
    expect(activeTreatmentForHive([closed, open], hive.id, '2026-07-18T00:00:00Z')).toBe(open);

    expect(hiveStatusTag(hive, [closed, open], '2026-07-18T00:00:00Z')).toEqual({
      label: 'TREATING UNTIL 2026-07-29',
      tone: 'warn',
    });
    expect(hiveStatusTag(hive, [closed], '2026-07-18T00:00:00Z')).toEqual({
      label: 'ACTIVE',
      tone: 'ok',
    });
    const archived = resource('hive', { name: 'Cedar', status: 'archived' });
    expect(hiveStatusTag(archived, [], '2026-07-18T00:00:00Z')).toEqual({
      label: 'ARCHIVED',
      tone: 'mut',
    });
  });

  it('accumulates monthly counts for sparklines and ignores unparseable dates', () => {
    const now = new Date('2026-07-18T12:00:00Z');
    expect(
      cumulativeMonthlySeries(['2026-02-10', '2026-05-01', '2026-07-01', 'not-a-date'], now),
    ).toEqual([1, 1, 1, 2, 2, 3]);
    expect(cumulativeMonthlySeries([], now)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('season harvest aggregation', () => {
  const now = new Date('2026-07-18T12:00:00Z');

  it('totals the season in the dominant unit and discloses excluded units', () => {
    const records = [
      resource('harvest', {
        hiveId: 'h1',
        harvestedAt: '2026-06-28T10:00:00Z',
        quantity: 18,
        unit: 'lb',
      }),
      resource('harvest', {
        hiveId: 'h2',
        harvestedAt: '2026-07-05T10:00:00Z',
        quantity: 24,
        unit: 'lb',
      }),
      resource('harvest', {
        hiveId: 'h3',
        harvestedAt: '2026-07-05T11:00:00Z',
        quantity: 9,
        unit: 'lb',
      }),
      resource('harvest', {
        hiveId: 'h1',
        harvestedAt: '2026-07-06T10:00:00Z',
        quantity: 2,
        unit: 'frames',
      }),
      resource('harvest', {
        hiveId: 'h1',
        harvestedAt: '2025-07-06T10:00:00Z',
        quantity: 40,
        unit: 'lb',
      }),
    ];
    const season = seasonHarvest(records, 2026, now);
    expect(season.unit).toBe('lb');
    expect(season.total).toBe(51);
    expect(season.byHive).toEqual([
      { hiveId: 'h2', quantity: 24 },
      { hiveId: 'h1', quantity: 18 },
      { hiveId: 'h3', quantity: 9 },
    ]);
    expect(season.otherUnits).toEqual(['frames']);
    // Cumulative through July: nothing before June, 18 by June, 51 by July.
    expect(season.series).toEqual([0, 0, 0, 0, 0, 18, 51]);
  });

  it('handles an empty season honestly', () => {
    const season = seasonHarvest([], 2026, now);
    expect(season.unit).toBeNull();
    expect(season.total).toBe(0);
    expect(season.byHive).toEqual([]);
  });
});
