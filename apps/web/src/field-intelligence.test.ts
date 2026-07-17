import { describe, expect, it } from 'vitest';
import type { LocalResource } from './db.js';
import { mergeFieldChoices, recentFieldValues } from './field-intelligence.js';

function record(id: string, value: string, updatedAt: string): LocalResource {
  return {
    key: `feedingEvent:${id}`,
    id,
    organizationId: '00000000-0000-4000-8000-000000000001',
    entityType: 'feedingEvent',
    version: 1,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    syncState: 'synchronized',
    data: { feedType: value },
  };
}

describe('field intelligence', () => {
  it('returns unique recent family values newest first', () => {
    expect(
      recentFieldValues(
        [
          record('old', 'Fondant', '2026-01-01T00:00:00Z'),
          record('new', 'Custom winter mix', '2026-07-01T00:00:00Z'),
          record('duplicate', 'fondant', '2026-06-01T00:00:00Z'),
        ],
        'feedType',
      ),
    ).toEqual(['Custom winter mix', 'fondant']);
  });

  it('keeps recent custom values while de-duplicating standard choices', () => {
    expect(mergeFieldChoices(['My mix', 'Fondant'], ['Fondant', 'Dry sugar'])).toEqual([
      'My mix',
      'Fondant',
      'Dry sugar',
    ]);
  });
});
