import { resolveConflict, type LocalResource } from '../db.js';
import { SyncBadge } from './SyncBadge.js';

export function RecordList({
  records,
  titleField,
  onEdit,
  onArchive,
}: {
  records: LocalResource[];
  titleField: string;
  onEdit?: (record: LocalResource) => void;
  onArchive?: (record: LocalResource, archive: boolean) => void;
}) {
  return (
    <ul className="record-list">
      {records.map((record) => (
        <li key={record.key}>
          <div>
            <strong>{String(record.data[titleField] ?? record.entityType)}</strong>
            <span>{recordSummary(record) ?? new Date(record.updatedAt).toLocaleString()}</span>
          </div>
          <div className="record-actions">
            <SyncBadge state={record.syncState} />
            {onEdit && (
              <button className="text-button" onClick={() => onEdit(record)}>
                Edit
              </button>
            )}
            {onArchive && (
              <button
                className="text-button"
                onClick={() =>
                  onArchive(record, !(record.data.archivedAt || record.data.status === 'archived'))
                }
              >
                {record.data.archivedAt || record.data.status === 'archived'
                  ? 'Restore'
                  : 'Archive'}
              </button>
            )}
            {record.syncState === 'conflicted' && record.conflict && (
              <>
                <button
                  className="text-button"
                  onClick={() => void resolveConflict(record, 'server')}
                >
                  Use server
                </button>
                <button
                  className="text-button"
                  onClick={() => void resolveConflict(record, 'local')}
                >
                  Retry mine
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function recordSummary(record: LocalResource): string | undefined {
  if (record.entityType === 'hive')
    return `${record.data.status} · ${record.data.origin || 'origin not recorded'}`;
  if (record.entityType === 'queen')
    return `${record.data.status} · ${record.data.marked ? `marked ${record.data.markColor || record.data.year || ''}` : 'unmarked'}${record.data.source ? ` · ${record.data.source}` : ''}`;
  if (record.entityType === 'equipmentBox')
    return `position ${record.data.position}${record.data.frameCount ? ` · ${record.data.frameCount} frames` : ''} · ${record.data.status}`;
  if (record.entityType === 'apiary')
    return String(
      record.data.location ||
        record.data.accessNotes ||
        new Date(record.updatedAt).toLocaleString(),
    );
  return undefined;
}
