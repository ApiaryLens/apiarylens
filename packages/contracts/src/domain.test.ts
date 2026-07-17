import { describe, expect, it } from 'vitest';
import { equipmentBoxFieldsSchema, weatherSnapshotSchema } from './domain.js';

describe('owner-feedback domain fields', () => {
  it('accepts custom hive equipment labels and lifecycle history', () => {
    const parsed = equipmentBoxFieldsSchema.parse({
      hiveId: '00000000-0000-4000-8000-000000000001',
      boxType: 'other',
      customType: 'Flow super',
      purpose: 'other',
      customPurpose: 'Comb production',
      position: 3,
      status: 'removed',
      installedAt: '2026-04-10',
      removedAt: '2026-07-17T12:00:00.000Z',
    });
    expect(parsed.customType).toBe('Flow super');
    expect(parsed.removedAt).toBe('2026-07-17T12:00:00.000Z');
  });

  it('accepts manual and provider weather snapshots while retaining provenance', () => {
    expect(weatherSnapshotSchema.parse({ conditions: 'Clear', source: 'manual' }).source).toBe(
      'manual',
    );
    const provider = weatherSnapshotSchema.parse({
      temperature: 22,
      temperatureUnit: 'c',
      source: 'provider',
      providerName: 'Self-hosted station',
      observedAt: '2026-07-17T12:00:00.000Z',
      attribution: 'Local operator-owned sensor',
    });
    expect(provider.providerName).toBe('Self-hosted station');
  });
});
