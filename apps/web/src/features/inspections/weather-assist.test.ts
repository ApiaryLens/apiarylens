import { describe, expect, it } from 'vitest';
import {
  compassFromDegrees,
  conditionsFromWeatherCode,
  lookupProviderConditions,
  matchHourlyObservation,
  openMeteoRequestUrl,
  pastDaysFor,
  roundCoordinate,
} from './weather-assist.js';

const NOW = new Date('2026-07-18T15:30:00.000Z');

describe('provider-assisted weather lookup', () => {
  it('rounds coordinates to about a kilometer before they leave the device', () => {
    expect(roundCoordinate(38.907192)).toBe(38.91);
    expect(roundCoordinate(-77.036873)).toBe(-77.04);
  });

  it('computes the past-day window and enforces honest limits', () => {
    expect(pastDaysFor('2026-07-18T09:00:00.000Z', NOW)).toBe(0);
    expect(pastDaysFor('2026-07-11T09:00:00.000Z', NOW)).toBe(7);
    expect(() => pastDaysFor('2026-07-20T09:00:00.000Z', NOW)).toThrow('not future times');
    expect(() => pastDaysFor('2026-01-01T09:00:00.000Z', NOW)).toThrow('last 92 days');
    expect(() => pastDaysFor('never', NOW)).toThrow('valid inspection date');
  });

  it('rejects future times on the current day but tolerates minor clock skew', () => {
    // 15:30Z now: a 17:00Z inspection has not happened yet even though the
    // UTC date matches, so no forecast may be stored as observed conditions.
    expect(() => pastDaysFor('2026-07-18T17:00:00.000Z', NOW)).toThrow('not future times');
    // Within the one-hour allowance for clock skew and just-started work.
    expect(pastDaysFor('2026-07-18T16:00:00.000Z', NOW)).toBe(0);
  });

  it('requests only rounded coordinates, units, and the covering window', () => {
    const url = new URL(
      openMeteoRequestUrl(
        { observedAt: '2026-07-16T09:00:00.000Z', latitude: 38.907192, longitude: -77.036873 },
        NOW,
      ),
    );
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('38.91');
    expect(url.searchParams.get('longitude')).toBe('-77.04');
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(url.searchParams.get('past_days')).toBe('2');
    expect(url.searchParams.get('timezone')).toBe('UTC');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'forecast_days',
      'hourly',
      'latitude',
      'longitude',
      'past_days',
      'temperature_unit',
      'timezone',
      'wind_speed_unit',
    ]);
  });

  it('maps WMO interpretation codes to the manual conditions vocabulary', () => {
    expect(conditionsFromWeatherCode(0)).toBe('Clear');
    expect(conditionsFromWeatherCode(2)).toBe('Partly cloudy');
    expect(conditionsFromWeatherCode(3)).toBe('Overcast');
    expect(conditionsFromWeatherCode(45)).toBe('Fog');
    expect(conditionsFromWeatherCode(53)).toBe('Light rain');
    expect(conditionsFromWeatherCode(63)).toBe('Rain');
    expect(conditionsFromWeatherCode(65)).toBe('Heavy rain');
    expect(conditionsFromWeatherCode(73)).toBe('Snow');
    expect(conditionsFromWeatherCode(95)).toBe('Thunderstorms');
    expect(conditionsFromWeatherCode(4242)).toBe('');
  });

  it('converts wind bearings to the eight-point manual vocabulary', () => {
    expect(compassFromDegrees(0)).toBe('n');
    expect(compassFromDegrees(44)).toBe('ne');
    expect(compassFromDegrees(90)).toBe('e');
    expect(compassFromDegrees(225)).toBe('sw');
    expect(compassFromDegrees(359)).toBe('n');
    expect(compassFromDegrees(-45)).toBe('nw');
  });

  it('matches the nearest provider hour and reports calm wind honestly', () => {
    const matched = matchHourlyObservation(
      {
        hourly: {
          time: ['2026-07-18T13:00', '2026-07-18T14:00', '2026-07-18T15:00'],
          temperature_2m: [81.2, 83.6, 84.9],
          relative_humidity_2m: [58, 55, 52],
          weather_code: [1, 2, 2],
          wind_speed_10m: [7.8, 0.4, 6.1],
          wind_direction_10m: [200, 210, 225],
        },
      },
      '2026-07-18T14:20:00.000Z',
    );
    expect(matched).toEqual({
      temperature: 83.6,
      temperatureUnit: 'f',
      conditions: 'Partly cloudy',
      humidity: 55,
      windSpeed: 0.4,
      windSpeedUnit: 'mph',
      windDirection: 'calm',
      observedHour: '2026-07-18T14:00:00.000Z',
    });
  });

  it('refuses to fill values when the response does not cover the observation', () => {
    const hourly = {
      time: ['2026-07-18T13:00'],
      temperature_2m: [81.2],
      relative_humidity_2m: [58],
      weather_code: [1],
      wind_speed_10m: [7.8],
      wind_direction_10m: [200],
    };
    expect(matchHourlyObservation({ hourly }, '2026-07-18T19:00:00.000Z')).toBeUndefined();
    expect(matchHourlyObservation({}, '2026-07-18T13:00:00.000Z')).toBeUndefined();
    expect(matchHourlyObservation(null, '2026-07-18T13:00:00.000Z')).toBeUndefined();
  });

  it('never contacts the provider without explicit consent', async () => {
    let called = 0;
    await expect(
      lookupProviderConditions({
        explicitConsent: false,
        latitude: 38.91,
        longitude: -77.04,
        observedAt: '2026-07-18T14:00:00.000Z',
        now: NOW,
        fetchImpl: async () => {
          called += 1;
          return new Response('{}');
        },
      }),
    ).rejects.toThrow('explicit consent');
    expect(called).toBe(0);
  });

  it('returns matched conditions from a consented lookup', async () => {
    const conditions = await lookupProviderConditions({
      explicitConsent: true,
      latitude: 38.907192,
      longitude: -77.036873,
      observedAt: '2026-07-18T14:00:00.000Z',
      now: NOW,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            hourly: {
              time: ['2026-07-18T14:00'],
              temperature_2m: [83.6],
              relative_humidity_2m: [55],
              weather_code: [2],
              wind_speed_10m: [6.1],
              wind_direction_10m: [225],
            },
          }),
        ),
    });
    expect(conditions.temperature).toBe(83.6);
    expect(conditions.windDirection).toBe('sw');
  });

  it('degrades to an honest manual-entry message on provider failure', async () => {
    await expect(
      lookupProviderConditions({
        explicitConsent: true,
        latitude: 38.91,
        longitude: -77.04,
        observedAt: '2026-07-18T14:00:00.000Z',
        now: NOW,
        fetchImpl: async () => new Response('down', { status: 503 }),
      }),
    ).rejects.toThrow('Enter conditions manually');
  });
});
