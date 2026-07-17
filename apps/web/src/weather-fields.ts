export function formatWeatherSummary(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Not recorded';
  const weather = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof weather.temperature === 'number')
    parts.push(`${weather.temperature}°${String(weather.temperatureUnit ?? 'f').toUpperCase()}`);
  if (weather.conditions) parts.push(String(weather.conditions));
  if (typeof weather.humidity === 'number') parts.push(`${weather.humidity}% humidity`);
  if (typeof weather.windSpeed === 'number') {
    const direction = weather.windDirection
      ? ` ${String(weather.windDirection).toUpperCase()}`
      : '';
    parts.push(`${weather.windSpeed} ${String(weather.windSpeedUnit ?? 'mph')}${direction} wind`);
  } else if (weather.wind) parts.push(String(weather.wind));
  return parts.length > 0 ? parts.join(' · ') : 'Not recorded';
}
