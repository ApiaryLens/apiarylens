/**
 * Owner dashboard iteration #1 (2026-07-18): the Overview weather block is
 * graphic — a condition icon and temperature hero like the other mock-up
 * dashboards — while keeping V2's type and color system. Pure helpers here;
 * the SVG lives in WeatherPanel.tsx. The condition is always conveyed in
 * text as well, never icon-only.
 */

export type WeatherGlyph =
  'sun' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind' | 'unknown';

/** Map a free-text conditions entry to an icon. Unknown text stays honest. */
export function weatherGlyph(conditions: string): WeatherGlyph {
  const text = conditions.trim().toLowerCase();
  if (!text) return 'unknown';
  if (/thunder|storm|lightning/.test(text)) return 'storm';
  if (/snow|sleet|flurr|ice/.test(text)) return 'snow';
  if (/rain|shower|drizzle|wet/.test(text)) return 'rain';
  if (/fog|mist|haze|smoke/.test(text)) return 'fog';
  if (/wind|breez|gust/.test(text)) return 'wind';
  if (/partly|partial|scattered|mostly sunny|sun and cloud|intervals/.test(text)) return 'partly';
  if (/overcast|cloud|grey|gray/.test(text)) return 'cloud';
  if (/sun|clear|fair|bright/.test(text)) return 'sun';
  return 'unknown';
}

/**
 * Honest freshness wording for a recorded conditions snapshot: same-day
 * readings show their time, older ones disclose their age so a stale
 * snapshot is never presented as current.
 */
export function conditionsFreshness(inspectedAt: string, now: Date = new Date()): string {
  const recorded = new Date(inspectedAt);
  if (!Number.isFinite(recorded.getTime())) return 'recorded time unknown';
  const elapsedDays = Math.floor((now.getTime() - recorded.getTime()) / 86_400_000);
  if (
    elapsedDays < 1 &&
    recorded.getFullYear() === now.getFullYear() &&
    recorded.getMonth() === now.getMonth() &&
    recorded.getDate() === now.getDate()
  ) {
    return `recorded today ${recorded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (elapsedDays <= 1) return 'recorded yesterday';
  if (elapsedDays <= 14) return `recorded ${elapsedDays} days ago`;
  return `recorded ${recorded.toLocaleDateString()}`;
}
