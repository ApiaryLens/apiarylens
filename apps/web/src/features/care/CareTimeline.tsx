import { queueUpdate, type LocalResource } from '../../db.js';
import { SyncBadge } from '../../components/SyncBadge.js';
import { careRecordTitle } from './care-records.js';

export function CareTimeline({
  records,
  onNotice,
  canWrite,
}: {
  records: LocalResource[];
  onNotice: (message: string) => void;
  canWrite: boolean;
}) {
  return (
    <ul className="record-list care-list">
      {records.map((record) => (
        <li key={record.key}>
          <div>
            <strong>{careRecordTitle(record)}</strong>
            <span>{new Date(record.updatedAt).toLocaleString()}</span>
            {Boolean(record.data.notes) && <small>{String(record.data.notes)}</small>}
          </div>
          <div className="record-actions">
            <SyncBadge state={record.syncState} />
            {canWrite && record.entityType === 'followUp' && !record.data.completedAt && (
              <button
                className="text-button"
                onClick={() =>
                  void queueUpdate(record, { completedAt: new Date().toISOString() }).then(() =>
                    onNotice('Follow-up marked complete.'),
                  )
                }
              >
                Complete
              </button>
            )}
            {canWrite && record.entityType === 'followUp' && Boolean(record.data.completedAt) && (
              <button
                className="text-button"
                onClick={() =>
                  void queueUpdate(record, { completedAt: null }).then(() =>
                    onNotice('Follow-up reopened.'),
                  )
                }
              >
                Reopen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
