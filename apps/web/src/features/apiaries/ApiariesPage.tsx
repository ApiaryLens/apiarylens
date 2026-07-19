import { useState } from 'react';
import { queueCreate, queueUpdate, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import type { PageRequest } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import { QuickForm } from '../../components/QuickForm.js';
import { RecordEditor } from '../../components/RecordEditor.js';
import { ResourcePage } from '../../components/ResourcePage.js';
import type { FormProps } from '../types.js';

export function Apiaries({
  organizationId,
  onNotice,
  canWrite = true,
  onNavigate,
}: FormProps & { onNavigate?: (request: PageRequest) => void }) {
  const records = useResources(organizationId, 'apiary');
  const hives = useResources(organizationId, 'hive');
  const [editing, setEditing] = useState<LocalResource>();
  const update = async (record: LocalResource, archive?: boolean) => {
    if (archive !== undefined) {
      await queueUpdate(record, { archivedAt: archive ? new Date().toISOString() : null });
      onNotice(archive ? 'Apiary archived.' : 'Apiary restored.');
      return;
    }
    setEditing(record);
  };
  return (
    <>
      {records.length > 0 && onNavigate && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-h">
            <h2>Yards</h2>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Apiary</th>
                  <th>Location</th>
                  <th className="num">Hives</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const yardHives = hives.filter(
                    (hive) => String(hive.data.apiaryId) === record.id,
                  );
                  return (
                    <tr key={record.id}>
                      <td>
                        <button
                          className="row-link"
                          type="button"
                          onClick={() => onNavigate({ page: 'apiary', apiaryId: record.id })}
                          aria-label={`Open apiary ${String(record.data.name)}`}
                        >
                          {String(record.data.name)}
                        </button>
                      </td>
                      <td>{record.data.location ? String(record.data.location) : '—'}</td>
                      <td className="num">{yardHives.length}</td>
                      <td>
                        <span className={`tag ${record.data.archivedAt ? 'mut' : 'ok'}`}>
                          {record.data.archivedAt ? 'ARCHIVED' : 'ACTIVE'}
                        </span>
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
        title="Apiaries"
        description="Locations where your colonies live."
        records={records}
        {...(canWrite
          ? {
              onEdit: (record: LocalResource) => void update(record),
              onArchive: (record: LocalResource, archive: boolean) => void update(record, archive),
            }
          : {})}
        form={
          canWrite ? (
            <QuickForm
              submitLabel="Add apiary"
              fields={[
                ['name', 'Apiary name', true],
                ['location', 'Location', false],
                ['accessNotes', 'Access notes', false],
                ['notes', 'Notes', false],
              ]}
              onSubmit={async (fields) => {
                await queueCreate(organizationId, 'apiary', fields);
                onNotice('Apiary saved on this device and queued for sync.');
              }}
            />
          ) : (
            <Empty text="Viewer access is read-only." />
          )
        }
      />
      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onNotice('Apiary changes saved offline.');
          }}
        />
      )}
    </>
  );
}
