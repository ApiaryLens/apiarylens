import { useEffect, useMemo, useState } from 'react';
import { useResources } from '../../local/use-resources.js';
import type { CareView } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import { filterCareRecords, filterRecordsByHive } from '../record-filters.js';
import type { FormProps } from '../types.js';
import { CareForm } from './CareForm.js';
import { CareTimeline } from './CareTimeline.js';
import { MiteTrend } from './MiteTrend.js';

export function CareRecords({
  organizationId,
  onNotice,
  canWrite = true,
  initialView,
  initialHiveId,
}: FormProps & { initialView?: CareView; initialHiveId?: string }) {
  const hives = useResources(organizationId, 'hive');
  const miteCounts = useResources(organizationId, 'miteCount');
  const observations = useResources(organizationId, 'healthObservation');
  const feedings = useResources(organizationId, 'feedingEvent');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const harvests = useResources(organizationId, 'harvest');
  const followUps = useResources(organizationId, 'followUp');
  const records = useMemo(
    () =>
      [...miteCounts, ...observations, ...feedings, ...treatments, ...harvests, ...followUps].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      ),
    [miteCounts, observations, feedings, treatments, harvests, followUps],
  );
  const [view, setView] = useState<CareView>(initialView ?? 'all');
  useEffect(() => setView(initialView ?? 'all'), [initialView]);
  // A hive-detail tile promises "follow-ups for this hive", so the requested
  // hive scope is honored here and stays adjustable in the filter row.
  const [hiveFilter, setHiveFilter] = useState(initialHiveId ?? 'all');
  useEffect(() => setHiveFilter(initialHiveId ?? 'all'), [initialHiveId]);
  const visibleRecords = filterRecordsByHive(filterCareRecords(records, view), hiveFilter);
  const filteredHiveName = hives.find((hive) => hive.id === hiveFilter)?.data.name;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Hive care</h1>
          <p>Health observations, feeding, treatment, harvest, mites, and follow-ups.</p>
        </div>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>Record care</h2>
          {!canWrite ? (
            <Empty text="Viewer access is read-only." />
          ) : hives.length === 0 ? (
            <Empty text="Add a hive first." />
          ) : (
            <CareForm
              organizationId={organizationId}
              hives={hives}
              records={records}
              onNotice={onNotice}
            />
          )}
        </section>
        <section className="card">
          <h2>Care timeline</h2>
          {records.length > 0 && (
            <label className="record-filter">
              Show
              <select
                value={view}
                onChange={(event) => setView(event.currentTarget.value as CareView)}
              >
                <option value="all">All care records</option>
                <option value="open-follow-ups">Open follow-ups</option>
              </select>
              {hives.length > 0 && (
                <select
                  aria-label="Hive"
                  value={hiveFilter}
                  onChange={(event) => setHiveFilter(event.currentTarget.value)}
                >
                  <option value="all">All hives</option>
                  {hives.map((hive) => (
                    <option key={hive.id} value={hive.id}>
                      {String(hive.data.name)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
          {records.length === 0 ? (
            <Empty text="No care records yet." />
          ) : visibleRecords.length === 0 ? (
            <Empty
              text={
                hiveFilter !== 'all'
                  ? `No matching care records for ${String(filteredHiveName ?? 'this hive')}.`
                  : 'No open follow-up items.'
              }
            />
          ) : (
            <CareTimeline records={visibleRecords} onNotice={onNotice} canWrite={canWrite} />
          )}
        </section>
      </div>
      <MiteTrend records={miteCounts} hives={hives} />
    </>
  );
}
