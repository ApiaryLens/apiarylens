/**
 * KPI-tile sparkline (V2 design language): a thin series-colored line with a
 * filled end dot. Decorative reinforcement of the tile's number — the honest
 * values live in the tile text, so the SVG is hidden from assistive tech.
 */
export function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const width = 72;
  const height = 26;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline className="sl" points={points.map(([x, y]) => `${x},${y}`).join(' ')} />
      {last && <circle className="sl-end" cx={last[0]} cy={last[1]} r="2.5" />}
    </svg>
  );
}
