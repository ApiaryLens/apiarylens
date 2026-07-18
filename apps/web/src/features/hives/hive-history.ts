import type { LocalResource } from '../../db.js';

export function historyDate(record: LocalResource) {
  for (const field of [
    'inspectedAt',
    'measuredAt',
    'observedAt',
    'fedAt',
    'applicationDate',
    'harvestedAt',
    'introductionDate',
    'updatedAt',
  ]) {
    if (record.data[field]) return String(record.data[field]);
  }
  return record.updatedAt;
}

export function timelineLabel(record: LocalResource) {
  return (
    (
      {
        inspection: `Inspection · ${record.data.state}`,
        queen: `Queen · ${record.data.identifier}`,
        equipmentBox: `Equipment · ${record.data.boxType}`,
        miteCount: `Mite count · ${record.data.miteCount}`,
        healthObservation: `Observation · ${record.data.category}`,
        feedingEvent: `Feeding · ${record.data.feedType}`,
        treatmentEvent: `Treatment · ${record.data.productOrMethod}`,
        harvest: `Harvest · ${record.data.quantity} ${record.data.unit}`,
        followUp: `Follow-up · ${record.data.completedAt ? 'complete' : 'open'}`,
      } as Record<string, string>
    )[record.entityType] ?? record.entityType
  );
}
