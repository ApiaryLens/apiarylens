import {
  createWeatherEnrichmentRequest,
  type WeatherEnrichmentRequest,
} from '../../weather-fields.js';

/**
 * Optional provider-assisted weather for inspections (FB-011, second stage).
 * The manual snapshot remains the primary, always-offline path; this module
 * only runs after the person explicitly consents in the inspection form, and
 * the request carries nothing beyond the approved observation time and
 * coordinates rounded to about a kilometer. Open-Meteo is used because it is
 * keyless: no account, no credential, and no per-family identifier is ever
 * created. Failure of any kind falls back to honest manual entry.
 */
export const openMeteoProviderName = 'Open-Meteo';
export const openMeteoAttribution = 'Weather data by Open-Meteo.com';
export const openMeteoHost = 'https://api.open-meteo.com';

/** Open-Meteo's forecast API can associate observations about this far back. */
export const providerHistoryLimitDays = 92;

export type ProviderConditions = {
  temperature: number | null;
  temperatureUnit: 'f';
  conditions: string;
  humidity: number | null;
  windSpeed: number | null;
  windSpeedUnit: 'mph';
  windDirection: string | null;
  observedHour: string;
};

/** Coordinates are rounded to two decimals (~1.1 km) before leaving the device. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

const DAY_MS = 86_400_000;

function utcDayStart(value: number): number {
  return Math.floor(value / DAY_MS) * DAY_MS;
}

/**
 * Number of past days of hourly history the provider must return to cover the
 * observation. Honest limits: no future lookups, and nothing older than the
 * provider's ~92-day association window.
 */
export function pastDaysFor(observedAt: string, now: Date = new Date()): number {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) throw new Error('Enter a valid inspection date first.');
  // Full-timestamp comparison: an inspection later today is still the future.
  // One hour of allowance covers clock skew and just-started inspections.
  if (observed > now.getTime() + 3_600_000)
    throw new Error('Weather lookup covers current and past conditions, not future times.');
  const dayDifference = (utcDayStart(now.getTime()) - utcDayStart(observed)) / DAY_MS;
  if (dayDifference > providerHistoryLimitDays)
    throw new Error(
      `The weather provider associates conditions for about the last ${providerHistoryLimitDays} days. Enter older weather manually.`,
    );
  return Math.max(0, dayDifference);
}

export function openMeteoRequestUrl(
  request: WeatherEnrichmentRequest,
  now: Date = new Date(),
): string {
  const url = new URL('/v1/forecast', openMeteoHost);
  url.searchParams.set('latitude', String(roundCoordinate(request.latitude)));
  url.searchParams.set('longitude', String(roundCoordinate(request.longitude)));
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m',
  );
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('past_days', String(pastDaysFor(request.observedAt, now)));
  url.searchParams.set('forecast_days', '1');
  return url.toString();
}

/** WMO weather interpretation codes mapped to the manual conditions vocabulary. */
export function conditionsFromWeatherCode(code: number): string {
  if (code === 0 || code === 1) return 'Clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Light rain';
  if ([61, 66, 80].includes(code)) return 'Light rain';
  if ([63, 81].includes(code)) return 'Rain';
  if ([65, 67, 82].includes(code)) return 'Heavy rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return '';
}

const COMPASS: ReadonlyArray<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'> = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
];

export function compassFromDegrees(degrees: number): (typeof COMPASS)[number] {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normalized / 45) % 8] ?? 'n';
}

function parseUtcHour(value: string): number {
  return Date.parse(value.length === 16 ? `${value}:00Z` : value);
}

function numberAt(values: unknown, index: number): number | null {
  if (!Array.isArray(values)) return null;
  const value = values[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Finds the provider hour nearest the observation. Returns undefined when the
 * response does not actually cover that time, so a wrong-looking value is
 * never silently filled in.
 */
export function matchHourlyObservation(
  payload: unknown,
  observedAt: string,
): ProviderConditions | undefined {
  const hourly = (payload as { hourly?: Record<string, unknown> } | null)?.hourly;
  const times = hourly?.time;
  if (!hourly || !Array.isArray(times) || times.length === 0) return undefined;
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return undefined;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < times.length; index += 1) {
    const time = parseUtcHour(String(times[index]));
    if (!Number.isFinite(time)) continue;
    const distance = Math.abs(time - observed);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestDistance > 2 * 3_600_000) return undefined;
  const windSpeed = numberAt(hourly.wind_speed_10m, bestIndex);
  const windDegrees = numberAt(hourly.wind_direction_10m, bestIndex);
  const code = numberAt(hourly.weather_code, bestIndex);
  return {
    temperature: numberAt(hourly.temperature_2m, bestIndex),
    temperatureUnit: 'f',
    conditions: code === null ? '' : conditionsFromWeatherCode(code),
    humidity: numberAt(hourly.relative_humidity_2m, bestIndex),
    windSpeed,
    windSpeedUnit: 'mph',
    windDirection:
      windSpeed !== null && windSpeed < 1
        ? 'calm'
        : windDegrees === null
          ? null
          : compassFromDegrees(windDegrees),
    observedHour: new Date(parseUtcHour(String(times[bestIndex]))).toISOString(),
  };
}

export async function lookupProviderConditions(input: {
  explicitConsent: boolean;
  latitude: number;
  longitude: number;
  observedAt: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ProviderConditions> {
  const request = createWeatherEnrichmentRequest({
    explicitConsent: input.explicitConsent,
    observedAt: input.observedAt,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  const url = openMeteoRequestUrl(request, input.now);
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(
      `The weather provider could not answer (status ${response.status}). Enter conditions manually.`,
    );
  const matched = matchHourlyObservation(await response.json(), request.observedAt);
  if (!matched)
    throw new Error('The provider has no observation near that time. Enter conditions manually.');
  return matched;
}
