import { describe, expect, it } from 'vitest';
import type { LocalResource } from './db.js';
import {
  activeEquipmentForHive,
  adjacentEquipment,
  equipmentPurposeLabel,
  equipmentTypeLabel,
  isFrameBox,
  nextEquipmentPosition,
} from './equipment-stack.js';

function equipment(id: string, hiveId: string, position: number, status = 'active'): LocalResource {
  return {
    key: `equipmentBox:${id}`,
    id,
    organizationId: '00000000-0000-4000-8000-000000000001',
    entityType: 'equipmentBox',
    version: 1,
    createdAt: '2026-07-17T12:00:00.000Z',
    updatedAt: '2026-07-17T12:00:00.000Z',
    deletedAt: null,
    syncState: 'synchronized',
    data: { hiveId, position, status, boxType: 'deep' },
  };
}

describe('equipment stack', () => {
  it('orders active components from bottom to top and preserves removed history', () => {
    const records = [
      equipment('top', 'hive-a', 3),
      equipment('removed', 'hive-a', 2, 'removed'),
      equipment('bottom', 'hive-a', 1),
    ];
    expect(activeEquipmentForHive(records, 'hive-a').map((item) => item.id)).toEqual([
      'bottom',
      'top',
    ]);
    expect(nextEquipmentPosition(records, 'hive-a')).toBe(4);
  });

  it('finds adjacent components for accessible reorder controls', () => {
    const records = [
      equipment('bottom', 'hive-a', 1),
      equipment('middle', 'hive-a', 2),
      equipment('top', 'hive-a', 3),
    ];
    expect(adjacentEquipment(records, records[1]!, -1)?.id).toBe('bottom');
    expect(adjacentEquipment(records, records[1]!, 1)?.id).toBe('top');
    expect(adjacentEquipment(records, records[0]!, -1)).toBeUndefined();
  });

  it('only requires frame counts for actual boxes', () => {
    expect(isFrameBox('deep')).toBe(true);
    expect(isFrameBox('queen_excluder')).toBe(false);
    expect(isFrameBox('outer_cover')).toBe(false);
  });

  it('uses beekeeper-defined type and purpose labels without changing stack behavior', () => {
    expect(equipmentTypeLabel({ boxType: 'other', customType: 'Flow super' })).toBe('Flow super');
    expect(equipmentPurposeLabel({ purpose: 'other', customPurpose: 'Comb production' })).toBe(
      'Comb production',
    );
    expect(equipmentTypeLabel({ boxType: 'deep' })).toBe('Deep box');
  });
});
