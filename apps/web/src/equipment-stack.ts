import type { LocalResource } from './db.js';

export const equipmentTypeLabels = {
  bottom_board: 'Bottom board',
  deep: 'Deep box',
  medium: 'Medium super',
  shallow: 'Shallow super',
  queen_excluder: 'Queen excluder',
  feeder: 'Feeder',
  inner_cover: 'Inner cover',
  outer_cover: 'Outer cover',
  other: 'Other component',
} as const;

export const equipmentPurposeLabels = {
  entrance: 'Entrance',
  brood: 'Brood',
  honey: 'Honey',
  feeding: 'Feeding',
  ventilation: 'Ventilation',
  cover: 'Cover',
  other: 'Other',
} as const;

export type EquipmentType = keyof typeof equipmentTypeLabels;
export type EquipmentPurpose = keyof typeof equipmentPurposeLabels;

export function equipmentTypeLabel(data: Record<string, unknown>): string {
  if (data.boxType === 'other' && String(data.customType ?? '').trim())
    return String(data.customType).trim();
  return equipmentTypeLabels[String(data.boxType) as EquipmentType] ?? 'Other component';
}

export function equipmentPurposeLabel(data: Record<string, unknown>): string {
  if (data.purpose === 'other' && String(data.customPurpose ?? '').trim())
    return String(data.customPurpose).trim();
  return data.purpose
    ? (equipmentPurposeLabels[String(data.purpose) as EquipmentPurpose] ?? String(data.purpose))
    : 'Purpose not recorded';
}

export function isFrameBox(type: string): boolean {
  return type === 'deep' || type === 'medium' || type === 'shallow';
}

export function activeEquipmentForHive(records: LocalResource[], hiveId: string): LocalResource[] {
  return records
    .filter((record) => record.data.hiveId === hiveId && record.data.status === 'active')
    .sort((left, right) => Number(left.data.position) - Number(right.data.position));
}

export function nextEquipmentPosition(records: LocalResource[], hiveId: string): number {
  const active = activeEquipmentForHive(records, hiveId);
  return Math.max(0, ...active.map((item) => Number(item.data.position))) + 1;
}

export function adjacentEquipment(
  records: LocalResource[],
  item: LocalResource,
  direction: -1 | 1,
): LocalResource | undefined {
  const active = activeEquipmentForHive(records, String(item.data.hiveId));
  const index = active.findIndex((candidate) => candidate.key === item.key);
  return active[index + direction];
}
