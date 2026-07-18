import type { LocalResource } from '../../db.js';
import { Empty } from '../../components/Empty.js';

export function MiteTrend({
  records,
  hives,
}: {
  records: LocalResource[];
  hives: LocalResource[];
}) {
  if (records.length === 0)
    return (
      <section className="card trend-card">
        <h2>Varroa trend</h2>
        <Empty text="Mite counts will form a chronological trend here." />
      </section>
    );
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  const points = [...records].sort((a, b) =>
    String(a.data.measuredAt).localeCompare(String(b.data.measuredAt)),
  );
  const max = Math.max(1, ...points.map((point) => Number(point.data.miteCount)));
  const coordinates = points
    .map(
      (point, index) =>
        `${points.length === 1 ? 50 : 5 + (index / (points.length - 1)) * 90},${92 - (Number(point.data.miteCount) / max) * 82}`,
    )
    .join(' ');
  return (
    <section className="card trend-card">
      <h2>Varroa trend</h2>
      <p>Recorded counts are observations, not an automated diagnosis.</p>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Mite counts over time, maximum ${max}`}
        preserveAspectRatio="none"
      >
        <line x1="5" y1="92" x2="95" y2="92" />
        <polyline points={coordinates} />
      </svg>
      <div className="trend-table" role="table" aria-label="Mite count history">
        {points.map((point) => (
          <div role="row" key={point.key}>
            <span role="cell">{new Date(String(point.data.measuredAt)).toLocaleDateString()}</span>
            <span role="cell">{hiveNames.get(String(point.data.hiveId)) ?? 'Hive'}</span>
            <strong role="cell">{String(point.data.miteCount)} mites</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
