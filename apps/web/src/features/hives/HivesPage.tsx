import { useMemo, useState } from 'react';
import { queueCreate, queueUpdate, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import { Empty } from '../../components/Empty.js';
import { QuickForm } from '../../components/QuickForm.js';
import { RecordEditor } from '../../components/RecordEditor.js';
import { RecordList } from '../../components/RecordList.js';
import { ResourcePage } from '../../components/ResourcePage.js';
import type { FormProps } from '../types.js';
import { EquipmentStackBuilder } from './EquipmentStackBuilder.js';
import { HiveTimeline } from './HiveTimeline.js';
import { historyDate } from './hive-history.js';
import { QueenForm } from './QueenForm.js';

export function Hives({ organizationId, onNotice, canWrite = true }: FormProps) {
  const records = useResources(organizationId, 'hive');
  const [editing, setEditing] = useState<LocalResource>();
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
  return (
    <>
      <ResourcePage
        title="Hives"
        description="Colonies and their current status."
        records={records}
        form={form}
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
