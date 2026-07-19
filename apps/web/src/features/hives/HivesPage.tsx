import { useEffect, useMemo, useState } from 'react';
import { queueCreate, queueUpdate, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import type { HiveStatusFilter, PageRequest } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import { QuickForm } from '../../components/QuickForm.js';
import { RecordEditor } from '../../components/RecordEditor.js';
import { RecordList } from '../../components/RecordList.js';
import { ResourcePage } from '../../components/ResourcePage.js';
import {
  formatMiteReading,
  hiveStatusTag,
  latestInspectionByHive,
  latestMiteByHive,
} from '../board-data.js';
import { filterHivesByStatus } from '../record-filters.js';
import type { FormProps } from '../types.js';
import { EquipmentStackBuilder } from './EquipmentStackBuilder.js';
import { stackCount } from './hive-stack.js';
import { HiveTimeline } from './HiveTimeline.js';
import { historyDate } from './hive-history.js';
import { QueenForm } from './QueenForm.js';

export function Hives({
  organizationId,
  onNotice,
  canWrite = true,
  initialStatusFilter,
  onNavigate,
}: FormProps & {
  initialStatusFilter?: HiveStatusFilter;
  onNavigate?: (request: PageRequest) => void;
}) {
  const records = useResources(organizationId, 'hive');
  const [editing, setEditing] = useState<LocalResource>();
  const [statusFilter, setStatusFilter] = useState<HiveStatusFilter>(initialStatusFilter ?? 'all');
  useEffect(() => setStatusFilter(initialStatusFilter ?? 'all'), [initialStatusFilter]);
  const visibleRecords = filterHivesByStatus(records, statusFilter);
  const apiaries = useResources(organizationId, 'apiary');
  const form = !canWrite ? (
    <Empty text="Viewer access is read-only." />
  ) : apiaries.length === 0 ? (
    <Empty text="Add an apiary before adding its first hive." />
  ) : (
    <QuickForm
      submitLabel="Add hive"
      fields={[
        ['name', 'Hive name or number', true],
        ['installDate', 'Install date (YYYY-MM-DD)', false],
        ['origin', 'Origin', false],
        ['notes', 'Notes', false],
      ]}
      select={{
        name: 'apiaryId',
        label: 'Apiary',
        options: apiaries.map((item) => [item.id, String(item.data.name)]),
      }}
      onSubmit={async (fields) => {
        await queueCreate(organizationId, 'hive', {
          ...fields,
          installDate: fields.installDate || null,
          status: 'active',
        });
        onNotice('Hive saved on this device and queued for sync.');
      }}
    />
  );
  const queens = useResources(organizationId, 'queen');
  const equipment = useResources(organizationId, 'equipmentBox');
  const inspections = useResources(organizationId, 'inspection');
  const miteCounts = useResources(organizationId, 'miteCount');
  const observations = useResources(organizationId, 'healthObservation');
  const feedings = useResources(organizationId, 'feedingEvent');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const harvests = useResources(organizationId, 'harvest');
  const followUps = useResources(organizationId, 'followUp');
  const history = useMemo(
    () =>
      [
        ...inspections,
        ...queens,
        ...equipment,
        ...miteCounts,
        ...observations,
        ...feedings,
        ...treatments,
        ...harvests,
        ...followUps,
      ].sort((a, b) => historyDate(b).localeCompare(historyDate(a))),
    [
      inspections,
      queens,
      equipment,
      miteCounts,
      observations,
      feedings,
      treatments,
      harvests,
      followUps,
    ],
  );
  const latestInspection = latestInspectionByHive(inspections);
  const latestMite = latestMiteByHive(miteCounts);
  const apiaryNames = new Map(apiaries.map((yard) => [yard.id, String(yard.data.name)]));
  const nowIso = new Date().toISOString();
  return (
    <>
      {visibleRecords.length > 0 && onNavigate && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-h">
            <h2>Hive board</h2>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hive</th>
                  <th>Yard</th>
                  <th className="num">Stack</th>
                  <th>Last insp.</th>
                  <th className="num">Mites</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => {
                  const status = hiveStatusTag(record, treatments, nowIso);
                  const inspection = latestInspection.get(record.id);
                  return (
                    <tr key={record.id}>
                      <td>
                        <button
                          className="row-link"
                          type="button"
                          onClick={() => onNavigate({ page: 'hive', hiveId: record.id })}
                          aria-label={`Open hive ${String(record.data.name)}`}
                        >
                          {String(record.data.name)}
                        </button>
                      </td>
                      <td>{apiaryNames.get(String(record.data.apiaryId)) ?? '—'}</td>
                      <td className="num">{stackCount(equipment, record.id) || '—'}</td>
                      <td>
                        {inspection ? (
                          new Date(String(inspection.data.inspectedAt)).toLocaleDateString()
                        ) : (
                          <span className="sub-t">n/a</span>
                        )}
                      </td>
                      <td className="num">{formatMiteReading(latestMite.get(record.id))}</td>
                      <td>
                        <span className={`tag ${status.tone}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ResourcePage
        title="Hives"
        description="Colonies and their current status."
        records={visibleRecords}
        form={form}
        {...(records.length > 0
          ? {
              toolbar: (
                <label className="record-filter">
                  Show
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.currentTarget.value as HiveStatusFilter)
                    }
                  >
                    <option value="all">All hives</option>
                    <option value="active">Active hives</option>
                    <option value="archived">Archived hives</option>
                  </select>
                </label>
              ),
            }
          : {})}
        {...(statusFilter !== 'all'
          ? { emptyText: `No ${statusFilter} hives match this filter.` }
          : {})}
        {...(canWrite
          ? {
              onEdit: (record: LocalResource) => setEditing(record),
              onArchive: (record: LocalResource, archive: boolean) =>
                void queueUpdate(record, {
                  archivedAt: archive ? new Date().toISOString() : null,
                  status: archive ? 'archived' : 'active',
                }).then(() => onNotice(archive ? 'Hive archived.' : 'Hive restored.')),
            }
          : {})}
      />
      {records.length > 0 && canWrite && (
        <div className="two-column management-grid">
          <section className="card">
            <h2>Queen history</h2>
            <QueenForm
              hives={records}
              onSubmit={async (fields) => {
                for (const current of queens.filter(
                  (queen) => queen.data.hiveId === fields.hiveId && queen.data.status === 'current',
                )) {
                  await queueUpdate(current, { status: 'superseded' });
                }
                await queueCreate(organizationId, 'queen', {
                  ...fields,
                  marked: fields.marked,
                  year: fields.year,
                  introductionDate: fields.introductionDate || null,
                  status: 'current',
                });
                onNotice('Queen history saved offline.');
              }}
            />
            <RecordList records={queens} titleField="identifier" />
          </section>
          <section className="card">
            <h2>Equipment stack</h2>
            <EquipmentStackBuilder
              organizationId={organizationId}
              hives={records}
              equipment={equipment}
              onNotice={onNotice}
            />
          </section>
        </div>
      )}
      {records.length > 0 && <HiveTimeline records={history} hives={records} />}
      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onNotice('Hive changes saved offline.');
          }}
        />
      )}
    </>
  );
}
