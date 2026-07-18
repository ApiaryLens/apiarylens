import type { LocalResource } from '../../db.js';

export const careTypes = [
  'miteCount',
  'healthObservation',
  'feedingEvent',
  'treatmentEvent',
  'harvest',
  'followUp',
] as const;
export type CareType = (typeof careTypes)[number];

export function careLabel(type: CareType) {
  return (
    {
      miteCount: 'Varroa mite count',
      healthObservation: 'Pest or health observation',
      feedingEvent: 'Feeding',
      treatmentEvent: 'Treatment',
      harvest: 'Honey harvest',
      followUp: 'Follow-up item',
    } as const
  )[type];
}

export function careRecordTitle(record: LocalResource) {
  if (record.entityType === 'miteCount')
    return `${record.data.miteCount} mites · ${String(record.data.method).replaceAll('_', ' ')}`;
  if (record.entityType === 'healthObservation') return `Observation · ${record.data.category}`;
  if (record.entityType === 'feedingEvent') return `Feeding · ${record.data.feedType}`;
  if (record.entityType === 'treatmentEvent') return `Treatment · ${record.data.productOrMethod}`;
  if (record.entityType === 'harvest')
    return `Harvest · ${record.data.quantity} ${record.data.unit}`;
  return String(record.data.description ?? 'Follow-up');
}
