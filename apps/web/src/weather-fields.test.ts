import { describe, expect, it } from 'vitest';
import {
  createWeatherEnrichmentRequest,
  formatWeatherSummary,
  readManualWeatherSnapshot,
} from './weather-fields.js';

describe('inspection weather fields', () => {
  it('formats an offline manual weather snapshot', () => {
    expect(
      formatWeatherSummary({
        temperature: 78,
        temperatureUnit: 'f',
        conditions: 'Partly cloudy',
        humidity: 61,
        windSpeed: 8,
        windSpeedUnit: 'mph',
        windDirection: 'sw',
      }),
    ).toBe('78°F · Partly cloudy · 61% humidity · 8 mph SW wind');
  });

  it('preserves legacy free-text wind and handles an empty snapshot', () => {
    expect(formatWeatherSummary({ wind: 'Light gusts from the west' })).toBe(
      'Light gusts from the west',
    );
    expect(formatWeatherSummary({})).toBe('Not recorded');
  });

  it('stores no empty weather object and records manual observation provenance', () => {
    const empty = new FormData();
    expect(readManualWeatherSnapshot(empty, '2026-07-17T12:00:00.000Z')).toBeNull();

    const values = new FormData();
    values.set('conditions', 'Clear');
    expect(readManualWeatherSnapshot(values, '2026-07-17T12:00:00.000Z')).toMatchObject({
      conditions: 'Clear',
      source: 'manual',
      observedAt: '2026-07-17T12:00:00.000Z',
    });
  });

  it('requires consent and minimizes the optional provider request', () => {
    expect(() =>
      createWeatherEnrichmentRequest({
        explicitConsent: false,
        observedAt: '2026-07-17T12:00:00.000Z',
        latitude: 38.9,
        longitude: -77,
      }),
    ).toThrow('explicit consent');
    expect(
      createWeatherEnrichmentRequest({
        explicitConsent: true,
        observedAt: '2026-07-17T12:00:00.000Z',
        latitude: 38.9,
        longitude: -77,
      }),
    ).toEqual({
      observedAt: '2026-07-17T12:00:00.000Z',
      latitude: 38.9,
      longitude: -77,
    });
  });
});
