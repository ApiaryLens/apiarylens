import type { FormEvent } from 'react';
import { queueUpdate, type LocalResource } from '../db.js';

export function RecordEditor({
  record,
  onClose,
  onSaved,
}: {
  record: LocalResource;
  onClose: () => void;
  onSaved: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
      string,
      string
    >;
    const payload =
      record.entityType === 'apiary'
        ? {
            name: values.name,
            location: values.location,
            accessNotes: values.accessNotes,
            notes: values.notes,
          }
        : {
            name: values.name,
            status: values.status,
            installDate: values.installDate || null,
            origin: values.origin,
            notes: values.notes,
          };
    await queueUpdate(record, payload);
    onSaved();
  }
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-editor-title"
    >
      <form className="card form record-editor" onSubmit={(event) => void submit(event)}>
        <h2 id="record-editor-title">Edit {record.entityType}</h2>
        <label>
          Name
          <input name="name" required defaultValue={String(record.data.name)} />
        </label>
        {record.entityType === 'apiary' ? (
          <>
            <label>
              Location
              <input name="location" defaultValue={String(record.data.location ?? '')} />
            </label>
            <label>
              Access notes
              <textarea
                name="accessNotes"
                rows={3}
                defaultValue={String(record.data.accessNotes ?? '')}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Status
              <select name="status" defaultValue={String(record.data.status)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="lost">Lost</option>
                <option value="sold">Sold</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Install date
              <input
                name="installDate"
                type="date"
                defaultValue={String(record.data.installDate ?? '')}
              />
            </label>
            <label>
              Origin
              <input name="origin" defaultValue={String(record.data.origin ?? '')} />
            </label>
          </>
        )}
        <label>
          Notes
          <textarea name="notes" rows={4} defaultValue={String(record.data.notes ?? '')} />
        </label>
        <div className="button-row">
          <button className="button primary">Save changes</button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
