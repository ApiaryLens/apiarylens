import type { LocalResource } from '../db.js';
import type { CareView, HiveStatusFilter } from '../navigation.js';

export function filterHivesByStatus(
  records: LocalResource[],
  filter: HiveStatusFilter,
): LocalResource[] {
  if (filter === 'all') return records;
  if (filter === 'archived') {
    return records.filter(
      (record) => record.data.status === 'archived' || Boolean(record.data.archivedAt),
    );
  }
  return records.filter((record) => record.data.status === 'active');
}

export function filterCareRecords(records: LocalResource[], view: CareView): LocalResource[] {
  if (view === 'open-follow-ups') {
    return records.filter((record) => record.entityType === 'followUp' && !record.data.completedAt);
  }
  return records;
}

/** Generic hive scoping for any hive-linked record list (inspections, care). */
export function filterRecordsByHive(
  records: LocalResource[],
  hiveId: string | 'all',
): LocalResource[] {
  if (hiveId === 'all') return records;
  return records.filter((record) => String(record.data.hiveId) === hiveId);
}

export function filterInspectionsByHive(
  records: LocalResource[],
  hiveId: string | 'all',
): LocalResource[] {
  return filterRecordsByHive(records, hiveId);
}
