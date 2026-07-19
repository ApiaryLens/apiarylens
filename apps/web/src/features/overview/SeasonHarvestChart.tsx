import type { SeasonHarvest } from '../board-data.js';
import { Empty } from '../../components/Empty.js';

/**
 * Season harvest by hive (V2 overview): horizontal bars in the validated
 * series color, 4px rounded data-end anchored to the hairline baseline, value
 * directly labeled at each bar end. Single series, one axis.
 */
export function SeasonHarvestChart({
  harvest,
  hiveNames,
  year,
}: {
  harvest: SeasonHarvest;
  hiveNames: Map<string, string>;
  year: number;
}) {
  if (harvest.byHive.length === 0)
    return <Empty text="Recorded harvests will chart here by hive." />;
  const rows = harvest.byHive.slice(0, 6);
  const rowHeight = 40;
  const width = 480;
  const left = 96;
  const right = 470;
  const chartTop = 10;
  const height = chartTop + rows.length * rowHeight + 28;
  const baselineTop = chartTop + 4;
  const baselineBottom = chartTop + rows.length * rowHeight - 4;
  const maxValue = Math.max(...rows.map((row) => row.quantity), 1);
  const name = (hiveId: string) => hiveNames.get(hiveId) ?? 'Removed hive';
  const summary = rows
    .map((row) => `${name(row.hiveId)} ${row.quantity} ${harvest.unit ?? ''}`.trim())
    .join(', ');
  return (
    <>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Bar chart, honey harvested per hive in ${year}: ${summary}.`}
      >
        {rows.map((row, index) => {
          const centerY = chartTop + index * rowHeight + rowHeight / 2;
          const barTop = centerY - 6;
          const length = Math.max(6, (row.quantity / maxValue) * (right - left - 40));
          return (
            <g key={row.hiveId}>
              <line
                className="grid-line"
                x1={left}
                y1={centerY - 20}
                x2={right}
                y2={centerY - 20}
              />
              <text className="axis-t" x={left - 8} y={centerY + 4} textAnchor="end">
                {name(row.hiveId)}
              </text>
              <path
                className="bar"
                tabIndex={0}
                d={`M${left} ${barTop} h${length} a4 4 0 0 1 4 4 v4 a4 4 0 0 1 -4 4 h-${length} z`}
              >
                <title>
                  {`${name(row.hiveId)} — ${row.quantity} ${harvest.unit ?? ''}`.trim()}
                </title>
              </path>
              <text className="val-t" x={left + length + 10} y={centerY + 4} textAnchor="start">
                {row.quantity}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={left} y1={baselineTop} x2={left} y2={baselineBottom} />
        <text className="axis-t" x={left} y={height - 8} textAnchor="start">
          0
        </text>
        <text className="axis-t" x={right} y={height - 8} textAnchor="end">
          {harvest.unit ?? 'quantity'}, season {year}
        </text>
      </svg>
      {(harvest.otherUnits.length > 0 || harvest.byHive.length > rows.length) && (
        <p className="chart-note">
          {harvest.otherUnits.length > 0 &&
            `Totals count ${harvest.unit ?? 'the most recorded unit'} only; also recorded: ${harvest.otherUnits.join(', ')}. `}
          {harvest.byHive.length > rows.length &&
            `Showing the top ${rows.length} of ${harvest.byHive.length} hives.`}
        </p>
      )}
    </>
  );
}
