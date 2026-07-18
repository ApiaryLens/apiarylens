import { useState } from 'react';
import { queueCreate, queueUpdate, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import { Empty } from '../../components/Empty.js';
import { QuickForm } from '../../components/QuickForm.js';
import { RecordEditor } from '../../components/RecordEditor.js';
import { ResourcePage } from '../../components/ResourcePage.js';
import type { FormProps } from '../types.js';

export function Apiaries({ organizationId, onNotice, canWrite = true }: FormProps) {
  const records = useResources(organizationId, 'apiary');
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
