import type { LocalResource } from './db.js';

export const fieldChoices = {
  broodCondition: [
    'Not observed',
    'Even brood pattern',
    'Spotty brood pattern',
    'Open brood present',
    'Capped brood present',
    'Drone-heavy brood',
    'Brood concern',
  ],
  stores: [
    'Not observed',
    'Empty',
    'Low',
    'Moderate',
    'Abundant',
    'Nectar',
    'Capped honey',
    'Pollen',
  ],
  category: [
    'Varroa mites',
    'Small hive beetles',
    'Wax moths',
    'Chalkbrood',
    'American foulbrood concern',
    'European foulbrood concern',
    'Nosema concern',
    'Deformed wings',
    'Queen concern',
    'Brood concern',
    'Starvation risk',
  ],
  feedType: [
    '1:1 sugar syrup',
    '2:1 sugar syrup',
    'Dry sugar',
    'Fondant',
    'Pollen substitute',
    'Honey frames',
  ],
  feedUnit: [
    'fl oz',
    'cup',
    'pint',
    'quart',
    'gallon',
    'mL',
    'L',
    'oz',
    'lb',
    'g',
    'kg',
    'frame',
    'patty',
  ],
  feedReason: [
    'Spring buildup',
    'Dearth support',
    'Winter stores',
    'Emergency feeding',
    'Queen rearing',
  ],
  treatment: [
    'Formic acid',
    'Oxalic acid vapor',
    'Oxalic acid dribble',
    'Thymol',
    'Amitraz',
    'Hop beta acids',
    'Drone brood removal',
    'Screened bottom board',
  ],
  restriction: [
    'Remove honey supers',
    'Follow label withdrawal period',
    'Protective equipment required',
    'Temperature limits apply',
  ],
  harvestUnit: ['oz', 'lb', 'g', 'kg', 'jar', 'frame', 'super'],
} as const;

export function recentFieldValues(records: LocalResource[], field: string, limit = 8): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const record of [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const value = String(record.data[field] ?? '').trim();
    if (!value || seen.has(value.toLocaleLowerCase())) continue;
    seen.add(value.toLocaleLowerCase());
    values.push(value);
    if (values.length === limit) break;
  }
  return values;
}

export function mergeFieldChoices(recent: string[], standard: readonly string[]): string[] {
  const values = [...recent, ...standard];
  return values.filter(
    (value, index) =>
      values.findIndex(
        (candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
      ) === index,
  );
}
