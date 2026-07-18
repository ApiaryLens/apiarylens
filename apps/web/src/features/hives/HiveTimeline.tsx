import type { LocalResource } from '../../db.js';
import { Empty } from '../../components/Empty.js';
import { SyncBadge } from '../../components/SyncBadge.js';
import { historyDate, timelineLabel } from './hive-history.js';

export function HiveTimeline({
  records,
  hives,
}: {
  records: LocalResource[];
  hives: LocalResource[];
}) {
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  return (
    <section className="card hive-timeline">
      <h2>Hive timeline</h2>
      {records.length === 0 ? (
        <Empty text="Inspections and management events will appear here in chronological order." />
      ) : (
        <ol>
          {records.map((record) => (
            <li key={record.key}>
              <time>{new Date(historyDate(record)).toLocaleString()}</time>
              <div>
                <strong>
                  {hiveNames.get(String(record.data.hiveId)) ?? 'Hive'} · {timelineLabel(record)}
                </strong>
                <p>
                  {String(
                    record.data.notes || record.data.description || record.data.followUpNotes || '',
                  )}
                </p>
              </div>
              <SyncBadge state={record.syncState} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
