import type { LocalResource } from '../../db.js';
import { type QueenMarkColor, queenColorForYear } from '../../queen-fields.js';

/** Pure selectors and filters behind the V2 hive detail screen. */

export type InspectionRange = 'season' | '90d' | 'all';

export interface InspectionFilters {
  range: InspectionRange;
  inspector: string; // 'all' or an exact inspector name
}

export function inspectionRangeLabel(range: InspectionRange, year: number): string {
  if (range === 'season') return `${year} season`;
  if (range === '90d') return 'Last 90 days';
  return 'All time';
}

/** Newest-first inspections for one hive under the active filters. */
export function filterHiveInspections(
  inspections: LocalResource[],
  hiveId: string,
  filters: InspectionFilters,
  now: Date,
): LocalResource[] {
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const season = String(now.getFullYear());
  return inspections
    .filter((record) => String(record.data.hiveId) === hiveId)
    .filter((record) => {
      const inspectedAt = String(record.data.inspectedAt);
      if (filters.range === 'season') return inspectedAt.slice(0, 4) === season;
      if (filters.range === '90d') return inspectedAt >= cutoff90;
      return true;
    })
    .filter(
      (record) =>
        filters.inspector === 'all' || String(record.data.inspectorName) === filters.inspector,
    )
    .sort((a, b) => String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)));
}

/** Distinct inspector names for the filter row, alphabetical. */
export function inspectorNames(inspections: LocalResource[], hiveId: string): string[] {
  const names = new Set<string>();
  for (const record of inspections) {
    if (String(record.data.hiveId) !== hiveId) continue;
    const name = String(record.data.inspectorName ?? '').trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Current queen for a hive: status "current", newest introduction first. */
export function currentQueen(queens: LocalResource[], hiveId: string): LocalResource | undefined {
  return queens
    .filter((record) => String(record.data.hiveId) === hiveId)
    .filter((record) => record.data.status === 'current')
    .sort((a, b) =>
      String(b.data.introductionDate ?? b.updatedAt).localeCompare(
        String(a.data.introductionDate ?? a.updatedAt),
      ),
    )[0];
}

const markColorHex: Record<QueenMarkColor, string> = {
  white: '#f2f2f0',
  yellow: '#e5c02e',
  red: '#c03a30',
  green: '#1d7f47',
  blue: '#2456b8',
};

export interface QueenMark {
  color: QueenMarkColor;
  hex: string;
  label: string;
}

/**
 * The queen's marking, from the recorded color when present or the
 * international year code when only a year is known. Unmarked queens (or
 * queens with neither color nor year) return undefined.
 */
export function queenMark(data: Record<string, unknown>): QueenMark | undefined {
  if (!data.marked) return undefined;
  const recorded = String(data.markColor ?? '').toLowerCase() as QueenMarkColor;
  if (recorded in markColorHex) {
    return { color: recorded, hex: markColorHex[recorded], label: `marked ${recorded}` };
  }
  const year = Number(data.year);
  if (Number.isFinite(year) && year > 0) {
    const color = queenColorForYear(year);
    return {
      color,
      hex: markColorHex[color],
      label: `marked ${color} (${year} code)`,
    };
  }
  return undefined;
}
