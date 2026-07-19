export type ManualWeatherSnapshot = {
  temperature: number | null;
  temperatureUnit: string;
  conditions: string;
  humidity: number | null;
  windSpeed: number | null;
  windSpeedUnit: string;
  windDirection: string | null;
  source: 'manual' | 'provider';
  providerName: string | null;
  attribution: string | null;
  observedAt: string;
};

type FormValues = Pick<FormData, 'get'>;

export function readManualWeatherSnapshot(
  values: FormValues,
  observedAt: string,
): ManualWeatherSnapshot | null {
  const text = (name: string) => String(values.get(name) ?? '').trim();
  const numeric = (name: string) => (text(name) === '' ? null : Number(text(name)));
  // A consented provider lookup records its provenance through these fields;
  // plain manual entry leaves them absent and stays source "manual".
  const providerAssisted = text('weatherSource') === 'provider';
  const snapshot: ManualWeatherSnapshot = {
    temperature: numeric('temperature'),
    temperatureUnit: text('temperatureUnit') || 'f',
    conditions: text('conditions'),
    humidity: numeric('humidity'),
    windSpeed: numeric('windSpeed'),
    windSpeedUnit: text('windSpeedUnit') || 'mph',
    windDirection: text('windDirection') || null,
    source: providerAssisted ? 'provider' : 'manual',
    providerName: providerAssisted ? text('weatherProviderName') || null : null,
    attribution: providerAssisted ? text('weatherAttribution') || null : null,
    observedAt: (providerAssisted && text('weatherObservedAt')) || observedAt,
  };
  return snapshot.temperature !== null ||
    snapshot.conditions !== '' ||
    snapshot.humidity !== null ||
    snapshot.windSpeed !== null ||
    snapshot.windDirection !== null
    ? snapshot
    : null;
}

/**
 * Provider adapters receive only the approved observation time and coordinates.
 * Hive records, family identity, notes, media, and credentials are intentionally
 * outside this boundary. The web inspection form offers one optional keyless
 * adapter (see features/inspections/weather-assist.ts); it stays behind this
 * consent gate and is never required to save an inspection.
 */
export type WeatherEnrichmentRequest = {
  observedAt: string;
  latitude: number;
  longitude: number;
};

export function createWeatherEnrichmentRequest(input: {
  explicitConsent: boolean;
  observedAt: string;
  latitude: number;
  longitude: number;
}): WeatherEnrichmentRequest {
  if (!input.explicitConsent) throw new Error('Weather lookup requires explicit consent.');
  if (input.latitude < -90 || input.latitude > 90) throw new Error('Latitude is out of range.');
  if (input.longitude < -180 || input.longitude > 180)
    throw new Error('Longitude is out of range.');
  return {
    observedAt: input.observedAt,
    latitude: input.latitude,
    longitude: input.longitude,
  };
}

export interface WeatherEnrichmentAdapter {
  readonly providerName: string;
  lookup(request: WeatherEnrichmentRequest): Promise<Record<string, unknown>>;
}

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
  if (parts.length === 0) return 'Not recorded';
  if (weather.source === 'provider' && weather.providerName)
    parts.push(`via ${String(weather.providerName)}`);
  return parts.join(' · ');
}
