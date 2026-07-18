import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../../db.js';
import { careLabel, careRecordTitle, careTypes } from './care-records.js';

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
    syncState: 'pending',
    data,
  } satisfies LocalResource;
}

describe('care records', () => {
  it('labels every supported care type', () => {
    for (const type of careTypes) {
      expect(careLabel(type)).toBeTruthy();
    }
  });

  it('summarizes each care record kind', () => {
    expect(careRecordTitle(record('miteCount', { miteCount: 7, method: 'alcohol_wash' }))).toBe(
      '7 mites · alcohol wash',
    );
    expect(careRecordTitle(record('healthObservation', { category: 'Chalkbrood' }))).toBe(
      'Observation · Chalkbrood',
    );
    expect(careRecordTitle(record('feedingEvent', { feedType: '2:1 syrup' }))).toBe(
      'Feeding · 2:1 syrup',
    );
    expect(careRecordTitle(record('harvest', { quantity: 18, unit: 'lb' }))).toBe(
      'Harvest · 18 lb',
    );
    expect(careRecordTitle(record('followUp', { description: 'Add a super' }))).toBe('Add a super');
    expect(careRecordTitle(record('followUp', {}))).toBe('Follow-up');
  });
});
