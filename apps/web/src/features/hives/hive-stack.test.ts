import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../../db.js';
import { stackCount, stackEntries, stackSummary } from './hive-stack.js';

let sequence = 0;
function equipment(data: Record<string, unknown>): LocalResource {
  sequence += 1;
  return {
    key: `key-${sequence}`,
    id: `id-${sequence}`,
    organizationId: 'org-1',
    entityType: 'equipmentBox',
    version: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    syncState: 'synchronized',
    data: { hiveId: 'hive-1', status: 'active', ...data },
  };
}

const fullStack = [
  equipment({ boxType: 'outer_cover', position: 8 }),
  equipment({ boxType: 'bottom_board', position: 1, purpose: 'entrance' }),
  equipment({ boxType: 'deep', position: 2, frameCount: 10, purpose: 'brood' }),
  equipment({ boxType: 'deep', position: 3, frameCount: 10, purpose: 'brood' }),
  equipment({ boxType: 'queen_excluder', position: 4, installedAt: '2026-05-24' }),
  equipment({ boxType: 'medium', position: 5, frameCount: 10, purpose: 'honey' }),
  equipment({ boxType: 'medium', position: 6, frameCount: 9, purpose: 'honey' }),
  equipment({ boxType: 'inner_cover', position: 7, purpose: 'ventilation' }),
  // Noise that must never appear: removed components and other hives.
  equipment({ boxType: 'shallow', position: 9, status: 'removed' }),
  equipment({ boxType: 'deep', position: 1, hiveId: 'hive-2' }),
];

describe('FB-009 hive stack schematic', () => {
  it('orders active components bottom to top with 1-based positions', () => {
    const entries = stackEntries(fullStack, 'hive-1');
    expect(entries.map((entry) => entry.name)).toEqual([
      'Bottom board',
      'Deep box',
      'Deep box',
      'Queen excluder',
      'Medium super',
      'Medium super',
      'Inner cover',
      'Outer cover',
    ]);
    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('assigns proportional silhouettes so the drawing matches the physical hive', () => {
    const entries = stackEntries(fullStack, 'hive-1');
    expect(entries.map((entry) => entry.silhouette)).toEqual([
      'thin', // bottom board
      'deep',
      'deep',
      'thin', // excluder
      'medium',
      'medium',
      'thin', // inner cover
      'cover',
    ]);
  });

  it('labels frame boxes with their size and frame count', () => {
    const entries = stackEntries(fullStack, 'hive-1');
    expect(entries[1]?.boxLabel).toBe('DEEP 10f');
    expect(entries[5]?.boxLabel).toBe('MED 9f');
    // Thin components carry no in-box label; their name lives in the table.
    expect(entries[0]?.boxLabel).toBe('');
  });

  it('carries purpose and install detail into the text list', () => {
    const entries = stackEntries(fullStack, 'hive-1');
    expect(entries[3]?.detail).toContain('added 2026-05-24');
    expect(entries[4]?.detail).toContain('Honey');
    expect(entries[4]?.detail).toContain('10 frames');
  });

  it('summarizes composition for KPI tiles', () => {
    expect(stackSummary(fullStack, 'hive-1')).toBe(
      'bottom board · 2 deep box · queen excluder · 2 medium super · inner cover · outer cover',
    );
    expect(stackCount(fullStack, 'hive-1')).toBe(8);
    expect(stackSummary(fullStack, 'hive-9')).toBe('No components recorded');
    expect(stackCount(fullStack, 'hive-9')).toBe(0);
  });

  it('renders a custom "other" component under its custom name', () => {
    const custom = [
      equipment({ boxType: 'other', customType: 'Slatted rack', position: 1, hiveId: 'hive-3' }),
    ];
    const entries = stackEntries(custom, 'hive-3');
    expect(entries[0]?.name).toBe('Slatted rack');
    expect(entries[0]?.silhouette).toBe('shallow');
  });
});
