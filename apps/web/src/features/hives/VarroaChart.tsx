import type { MiteReading } from '../board-data.js';
import { Empty } from '../../components/Empty.js';

const width = 480;
const height = 180;
const left = 40;
const right = 470;
const top = 16;
const baselineY = 164;
const labelY = 178;

function methodLabel(method: string): string {
  return method.replaceAll('_', ' ');
}

/**
 * Season varroa trend for one hive (V2 hive detail). When every reading
 * recorded a sample size the chart plots mites per 100 bees and draws the
 * common 2.0 reference line; otherwise it plots the raw counts as entered and
 * shows no reference, because the two scales are not comparable. Readings are
 * observations, never a diagnosis.
 */
export function VarroaChart({ readings }: { readings: MiteReading[] }) {
  if (readings.length === 0)
    return <Empty text="Mite counts recorded for this hive will form a trend here." />;
  const per100 = readings.every((reading) => reading.per100 !== null);
  const values = readings.map((reading) => (per100 ? (reading.per100 ?? 0) : reading.count));
  const maxValue = Math.max(per100 ? 3 : 1, ...values);
  const y = (value: number) => baselineY - (value / maxValue) * (baselineY - top);
  const x = (index: number) =>
    readings.length === 1
      ? (left + right) / 2
      : left + 40 + (index / (readings.length - 1)) * (right - left - 70);
  const gridValues = [maxValue, (maxValue * 2) / 3, maxValue / 3];
  const format = (value: number) => (per100 ? value.toFixed(1) : String(Math.round(value)));
  const dateLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const last = readings.length - 1;
  const summary = readings
    .map(
      (reading, index) =>
        `${dateLabel(reading.measuredAt)} ${format(values[index] ?? 0)}${per100 ? ' per 100 bees' : ' mites'}`,
    )
    .join(', ');
  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${per100 ? 'Line chart, varroa mites per 100 bees' : 'Line chart, raw varroa mite counts'}: ${summary}.${per100 ? ' Common treatment reference 2.0.' : ''}`}
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line className="grid-line" x1={left} y1={y(value)} x2={right} y2={y(value)} />
          <text className="axis-t" x={left - 8} y={y(value) + 4} textAnchor="end">
            {format(value)}
          </text>
        </g>
      ))}
      {per100 && maxValue >= 2 && (
        <g>
          <line className="thresh" x1={left} y1={y(2)} x2={right} y2={y(2)} />
          <text className="thresh-t" x={left + 8} y={y(2) - 6} textAnchor="start">
            common treatment reference 2.0
          </text>
        </g>
      )}
      <polyline
        className="mite-line"
        points={readings.map((_, index) => `${x(index)},${y(values[index] ?? 0)}`).join(' ')}
      />
      {readings.map((reading, index) => (
        <circle
          key={reading.measuredAt + String(index)}
          className="mite-dot"
          cx={x(index)}
          cy={y(values[index] ?? 0)}
          r={index === last ? 5.5 : 4.5}
          tabIndex={0}
        >
          <title>
            {`${dateLabel(reading.measuredAt)} — ${format(values[index] ?? 0)}${
              per100 ? ' per 100 bees' : ' mites'
            }${
              reading.sampleSize
                ? ` (${reading.count}/${reading.sampleSize} · ${methodLabel(reading.method)})`
                : ` (${methodLabel(reading.method)})`
            }`}
          </title>
        </circle>
      ))}
      {readings.length > 0 && (
        <text className="val-t" x={x(last)} y={y(values[last] ?? 0) - 12} textAnchor="middle">
          {format(values[last] ?? 0)}
        </text>
      )}
      <line className="baseline" x1={left} y1={baselineY} x2={right} y2={baselineY} />
      {readings.map((reading, index) => {
        // Thin date labels when the series is dense: first, last, and every
        // other point in between keep the axis readable.
        if (readings.length > 6 && index !== 0 && index !== last && index % 2 === 1) return null;
        return (
          <text
            key={`label-${reading.measuredAt}-${String(index)}`}
            className="axis-t"
            x={x(index)}
            y={labelY}
            textAnchor="middle"
          >
            {dateLabel(reading.measuredAt)}
          </text>
        );
      })}
    </svg>
  );
}
