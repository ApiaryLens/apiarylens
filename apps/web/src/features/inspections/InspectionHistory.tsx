import type { LocalResource } from '../../db.js';
import { formatWeatherSummary } from '../../weather-fields.js';
import { SyncBadge } from '../../components/SyncBadge.js';
import { yesNo } from './format.js';

export function InspectionHistory({
  records,
  hives,
  onEdit,
}: {
  records: LocalResource[];
  hives: LocalResource[];
  onEdit?: (record: LocalResource) => void;
}) {
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  return (
    <div className="history-list">
      {[...records]
        .sort((a, b) => String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)))
        .map((record) => (
          <details key={record.key}>
            <summary>
              <span>
                <strong>{hiveNames.get(String(record.data.hiveId)) ?? 'Hive'}</strong>
                <small>
                  {new Date(String(record.data.inspectedAt)).toLocaleString()} ·{' '}
                  {String(record.data.state)}
                </small>
              </span>
              <SyncBadge state={record.syncState} />
            </summary>
            <dl className="inspection-summary">
              <dt>Inspector</dt>
              <dd>{String(record.data.inspectorName)}</dd>
              <dt>Temperament</dt>
              <dd>{String(record.data.temperament).replaceAll('_', ' ')}</dd>
              <dt>Population</dt>
              <dd>{String(record.data.populationStrength).replaceAll('_', ' ')}</dd>
              <dt>Queen seen</dt>
              <dd>{yesNo(record.data.queenSeen)}</dd>
              <dt>Eggs or larvae</dt>
              <dd>{yesNo(record.data.eggsOrLarvae)}</dd>
              <dt>Brood</dt>
              <dd>{String(record.data.broodCondition || 'Not recorded')}</dd>
              <dt>Stores</dt>
              <dd>{String(record.data.stores || 'Not recorded')}</dd>
              <dt>Weather</dt>
              <dd>{formatWeatherSummary(record.data.weather)}</dd>
              <dt>Notes</dt>
              <dd>{String(record.data.notes || 'None')}</dd>
            </dl>
            {onEdit && (
              <button className="button secondary" onClick={() => onEdit(record)}>
                Edit inspection
              </button>
            )}
          </details>
        ))}
    </div>
  );
}
