import type { LocalResource } from '../../db.js';
import {
  activeEquipmentForHive,
  equipmentPurposeLabel,
  equipmentTypeLabel,
  isFrameBox,
} from '../../equipment-stack.js';

/**
 * FB-009 — visual + text equipment stack. The schematic is an
 * engineering-drawing style silhouette of the physical hive: every active
 * component becomes one proportional box, bottom to top, and the numbered
 * table beside it is the text alternative carrying the same order and detail.
 */
export type StackSilhouette = 'deep' | 'medium' | 'shallow' | 'thin' | 'cover';

export interface StackEntry {
  key: string;
  /** 1-based position counted from the bottom board up, matching the yard. */
  position: number;
  silhouette: StackSilhouette;
  /** Short label drawn inside boxes that are tall enough to hold text. */
  boxLabel: string;
  /** Full component name for the text list. */
  name: string;
  /** Purpose / frame / date detail for the text list. */
  detail: string;
}

const silhouettes: Record<string, StackSilhouette> = {
  deep: 'deep',
  medium: 'medium',
  shallow: 'shallow',
  feeder: 'shallow',
  bottom_board: 'thin',
  queen_excluder: 'thin',
  inner_cover: 'thin',
  outer_cover: 'cover',
  other: 'shallow',
};

function boxLabel(data: Record<string, unknown>): string {
  const type = String(data.boxType);
  if (!isFrameBox(type) && type !== 'feeder') return '';
  const prefix =
    type === 'deep' ? 'DEEP' : type === 'medium' ? 'MED' : type === 'shallow' ? 'SHAL' : 'FEEDER';
  const frames = Number(data.frameCount);
  return Number.isFinite(frames) && frames > 0 ? `${prefix} ${frames}f` : prefix;
}

function detail(data: Record<string, unknown>): string {
  const parts: string[] = [];
  if (data.purpose) parts.push(equipmentPurposeLabel(data));
  const frames = Number(data.frameCount);
  if (Number.isFinite(frames) && frames > 0) parts.push(`${frames} frames`);
  if (data.installedAt) parts.push(`added ${String(data.installedAt)}`);
  if (data.notes) parts.push(String(data.notes));
  return parts.join(' · ') || '—';
}

/** Active components for a hive as schematic entries, bottom to top. */
export function stackEntries(equipment: LocalResource[], hiveId: string): StackEntry[] {
  return activeEquipmentForHive(equipment, hiveId).map((item, index) => ({
    key: item.key,
    position: index + 1,
    silhouette: silhouettes[String(item.data.boxType)] ?? 'shallow',
    boxLabel: boxLabel(item.data),
    name: equipmentTypeLabel(item.data),
    detail: detail(item.data),
  }));
}

/** "2 deep · 2 medium · excluder" style summary for KPI tiles and tables. */
export function stackSummary(equipment: LocalResource[], hiveId: string): string {
  const active = activeEquipmentForHive(equipment, hiveId);
  if (active.length === 0) return 'No components recorded';
  const counts = new Map<string, number>();
  for (const item of active) {
    const label = equipmentTypeLabel(item.data).toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => (count > 1 ? `${count} ${label}` : label))
    .join(' · ');
}

export function stackCount(equipment: LocalResource[], hiveId: string): number {
  return activeEquipmentForHive(equipment, hiveId).length;
}
