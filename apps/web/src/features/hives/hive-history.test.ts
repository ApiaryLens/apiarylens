import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../../db.js';
import { historyDate, timelineLabel } from './hive-history.js';

function record(entityType: LocalResource['entityType'], data: Record<string, unknown>) {
  return {
    key: `org:${entityType}:id`,
    id: 'id',
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

describe('hive history', () => {
  it('prefers the domain timestamp for each record kind', () => {
    expect(historyDate(record('inspection', { inspectedAt: '2026-07-04T09:00:00.000Z' }))).toBe(
      '2026-07-04T09:00:00.000Z',
    );
    expect(historyDate(record('miteCount', { measuredAt: '2026-07-05T09:00:00.000Z' }))).toBe(
      '2026-07-05T09:00:00.000Z',
    );
    expect(historyDate(record('queen', { introductionDate: '2026-06-01' }))).toBe('2026-06-01');
  });

  it('falls back to the record update time', () => {
    expect(historyDate(record('equipmentBox', { position: 1 }))).toBe('2026-07-10T00:00:00.000Z');
  });

  it('labels timeline entries by record kind', () => {
    expect(timelineLabel(record('inspection', { state: 'complete' }))).toBe(
      'Inspection · complete',
    );
    expect(timelineLabel(record('treatmentEvent', { productOrMethod: 'Oxalic acid' }))).toBe(
      'Treatment · Oxalic acid',
    );
    expect(timelineLabel(record('followUp', { completedAt: null }))).toBe('Follow-up · open');
    expect(timelineLabel(record('followUp', { completedAt: '2026-07-09T00:00:00.000Z' }))).toBe(
      'Follow-up · complete',
    );
  });
});
