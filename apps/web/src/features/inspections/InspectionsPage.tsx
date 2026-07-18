import { useEffect, useState } from 'react';
import type { LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import { Empty } from '../../components/Empty.js';
import { filterInspectionsByHive } from '../record-filters.js';
import type { FormProps } from '../types.js';
import { InspectionForm } from './InspectionForm.js';
import { InspectionHistory } from './InspectionHistory.js';
import { MediaGallery } from './MediaGallery.js';

export function Inspections({
  organizationId,
  onNotice,
  canWrite = true,
  initialHiveId,
}: FormProps & { initialHiveId?: string }) {
  const records = useResources(organizationId, 'inspection');
  const hives = useResources(organizationId, 'hive');
  const [editing, setEditing] = useState<LocalResource>();
  const [hiveFilter, setHiveFilter] = useState(initialHiveId ?? 'all');
  useEffect(() => setHiveFilter(initialHiveId ?? 'all'), [initialHiveId]);
  const visibleRecords = filterInspectionsByHive(records, hiveFilter);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inspections</h1>
          <p>Start in the yard, save a draft, add photos, and complete the review later.</p>
        </div>
      </div>
      <div className="inspection-layout">
        <section className="card">
          <h2>{editing ? 'Edit inspection' : 'Start an inspection'}</h2>
          {!canWrite ? (
            <Empty text="Viewer access is read-only." />
          ) : hives.length === 0 ? (
            <Empty text="Add a hive before recording an inspection." />
          ) : (
            <InspectionForm
              organizationId={organizationId}
              hives={hives}
              editing={editing}
              onCancel={() => setEditing(undefined)}
              onSaved={(message) => {
                setEditing(undefined);
                onNotice(message);
              }}
            />
          )}
        </section>
        <section className="card">
          <h2>Inspection history</h2>
          {records.length > 0 && hives.length > 0 && (
            <label className="record-filter">
              Hive
              <select
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
            </label>
          )}
          {records.length === 0 ? (
            <Empty text="No inspections yet." />
          ) : visibleRecords.length === 0 ? (
            <Empty text="No inspections recorded for this hive yet." />
          ) : (
            <InspectionHistory
              records={visibleRecords}
              hives={hives}
              {...(canWrite ? { onEdit: setEditing } : {})}
            />
          )}
        </section>
      </div>
      <MediaGallery
        organizationId={organizationId}
        inspections={records}
        onNotice={onNotice}
        canWrite={canWrite}
      />
    </>
  );
}
