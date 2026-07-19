import type { LocalResource } from '../db.js';

/**
 * Pure selectors behind the V2 dashboard and yard tables (hive status board,
 * apiary hive tables, KPI sparklines). Everything here reads only what the
 * local workspace actually recorded — no value is ever fabricated; a missing
 * reading stays missing and renders as an em dash.
 */

/** Most recent inspection per hive id, chosen by inspectedAt. */
export function latestInspectionByHive(inspections: LocalResource[]): Map<string, LocalResource> {
  const latest = new Map<string, LocalResource>();
  for (const inspection of [...inspections].sort((a, b) =>
    String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)),
  )) {
    const hiveId = String(inspection.data.hiveId);
    if (!latest.has(hiveId)) latest.set(hiveId, inspection);
  }
  return latest;
}

export interface MiteReading {
  /** Mites per 100 bees when the count recorded a sample size; else null. */
  per100: number | null;
  /** The raw mite count as entered. */
  count: number;
  measuredAt: string;
  method: string;
  sampleSize: number | null;
}

function toReading(record: LocalResource): MiteReading {
  const sampleSize = Number(record.data.sampleSize);
  const rawPercent = record.data.resultPercent;
  return {
    per100:
      typeof rawPercent === 'number' && Number.isFinite(rawPercent)
        ? Math.round(rawPercent * 10) / 10
        : null,
    count: Number(record.data.miteCount),
    measuredAt: String(record.data.measuredAt),
    method: String(record.data.method ?? 'other'),
    sampleSize: Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : null,
  };
}

/** Latest mite reading per hive id, chosen by measuredAt. */
export function latestMiteByHive(miteCounts: LocalResource[]): Map<string, MiteReading> {
  const latest = new Map<string, MiteReading>();
  for (const record of [...miteCounts].sort((a, b) =>
    String(b.data.measuredAt).localeCompare(String(a.data.measuredAt)),
  )) {
    const hiveId = String(record.data.hiveId);
    if (!latest.has(hiveId)) latest.set(hiveId, toReading(record));
  }
  return latest;
}

/** Chronological mite readings for one hive (for the varroa trend chart). */
export function miteSeriesForHive(miteCounts: LocalResource[], hiveId: string): MiteReading[] {
  return miteCounts
    .filter((record) => String(record.data.hiveId) === hiveId)
    .sort((a, b) => String(a.data.measuredAt).localeCompare(String(b.data.measuredAt)))
    .map(toReading);
}

/** Honest table text for a mite reading: per-100 when known, else raw. */
export function formatMiteReading(reading: MiteReading | undefined): string {
  if (!reading) return '—';
  if (reading.per100 !== null) return reading.per100.toFixed(1);
  return `${reading.count} mites`;
}

/**
 * A treatment window that is still open: no removal date recorded yet, or a
 * removal date that has not passed. Derived purely from recorded treatment
 * events — never a diagnosis.
 */
export function activeTreatmentForHive(
  treatments: LocalResource[],
  hiveId: string,
  today: string,
): LocalResource | undefined {
  const todayDate = today.slice(0, 10);
  return treatments
    .filter((record) => String(record.data.hiveId) === hiveId)
    .filter((record) => {
      const removal = record.data.removalDate ? String(record.data.removalDate) : null;
      return removal === null || removal >= todayDate;
    })
    .sort((a, b) =>
      String(b.data.applicationDate).localeCompare(String(a.data.applicationDate)),
    )[0];
}

export interface HiveStatusTag {
  label: string;
  tone: 'ok' | 'warn' | 'mut';
}

/** Status tag for a hive row: archived, treating, or active — data-derived. */
export function hiveStatusTag(
  hive: LocalResource,
  treatments: LocalResource[],
  today: string,
): HiveStatusTag {
  if (hive.data.status === 'archived' || hive.data.archivedAt)
    return { label: 'ARCHIVED', tone: 'mut' };
  const treating = activeTreatmentForHive(treatments, hive.id, today);
  if (treating) {
    const removal = treating.data.removalDate ? String(treating.data.removalDate) : null;
    return { label: removal ? `TREATING UNTIL ${removal}` : 'TREATING', tone: 'warn' };
  }
  return { label: 'ACTIVE', tone: 'ok' };
}

/**
 * Cumulative monthly series for a KPI sparkline: how many of the given dates
 * fall on or before the end of each of the trailing `months` calendar months.
 * Dates that cannot be parsed are ignored rather than guessed at.
 */
export function cumulativeMonthlySeries(dates: readonly string[], now: Date, months = 6): number[] {
  // Bucket by the ISO year-month prefix so the series is deterministic across
  // timezones (records store ISO strings).
  const monthOf = (value: string): string | undefined => {
    const match = /^(\d{4})-(\d{2})/.exec(value);
    if (match) return `${match[1]}-${match[2]}`;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return undefined;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  };
  const recorded = dates.map(monthOf).filter((value): value is string => typeof value === 'string');
  const series: number[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const bucket = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${bucket.getFullYear()}-${String(bucket.getMonth() + 1).padStart(2, '0')}`;
    series.push(recorded.filter((month) => month <= key).length);
  }
  return series;
}

export interface HarvestTotal {
  hiveId: string;
  quantity: number;
}

export interface SeasonHarvest {
  /** The most frequently recorded unit this season; totals use only it. */
  unit: string | null;
  total: number;
  byHive: HarvestTotal[];
  /** Units seen but excluded from the totals, disclosed in the chart note. */
  otherUnits: string[];
  /** Cumulative harvest through the season, for the KPI sparkline. */
  series: number[];
}

/**
 * Season harvest in the dominant recorded unit. Mixed units are never summed
 * together silently: the chart totals one unit and names the others.
 */
export function seasonHarvest(harvests: LocalResource[], year: number, now: Date): SeasonHarvest {
  const inSeason = harvests.filter(
    (record) => String(record.data.harvestedAt).slice(0, 4) === String(year),
  );
  const unitCounts = new Map<string, number>();
  for (const record of inSeason) {
    const unit = String(record.data.unit || '').trim() || 'unrecorded unit';
    unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1);
  }
  const unit =
    [...unitCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null;
  const counted = inSeason.filter(
    (record) => (String(record.data.unit || '').trim() || 'unrecorded unit') === unit,
  );
  const byHiveMap = new Map<string, number>();
  let total = 0;
  for (const record of counted) {
    const quantity = Number(record.data.quantity);
    if (!Number.isFinite(quantity)) continue;
    total += quantity;
    const hiveId = String(record.data.hiveId);
    byHiveMap.set(hiveId, (byHiveMap.get(hiveId) ?? 0) + quantity);
  }
  const series: number[] = [];
  const monthsSoFar = now.getFullYear() === year ? now.getMonth() + 1 : 12;
  for (let month = 1; month <= monthsSoFar; month += 1) {
    const end = `${year}-${String(month + 1).padStart(2, '0')}`;
    series.push(
      counted
        .filter((record) => String(record.data.harvestedAt).slice(0, 7) < end)
        .reduce((sum, record) => sum + (Number(record.data.quantity) || 0), 0),
    );
  }
  return {
    unit,
    total: Math.round(total * 100) / 100,
    byHive: [...byHiveMap.entries()]
      .map(([hiveId, quantity]) => ({ hiveId, quantity: Math.round(quantity * 100) / 100 }))
      .sort((a, b) => b.quantity - a.quantity),
    otherUnits: [...unitCounts.keys()].filter((candidate) => candidate !== unit).sort(),
    series,
  };
}
