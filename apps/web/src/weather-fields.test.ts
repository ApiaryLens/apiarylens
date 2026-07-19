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
      providerName: null,
      attribution: null,
      observedAt: '2026-07-17T12:00:00.000Z',
    });
  });

  it('records provider provenance only after a consented lookup filled the form', () => {
    const values = new FormData();
    values.set('temperature', '83.6');
    values.set('conditions', 'Partly cloudy');
    values.set('weatherSource', 'provider');
    values.set('weatherProviderName', 'Open-Meteo');
    values.set('weatherAttribution', 'Weather data by Open-Meteo.com');
    values.set('weatherObservedAt', '2026-07-17T11:00:00.000Z');
    expect(readManualWeatherSnapshot(values, '2026-07-17T11:20:00.000Z')).toMatchObject({
      source: 'provider',
      providerName: 'Open-Meteo',
      attribution: 'Weather data by Open-Meteo.com',
      observedAt: '2026-07-17T11:00:00.000Z',
    });

    const forged = new FormData();
    forged.set('conditions', 'Clear');
    forged.set('weatherProviderName', 'Somewhere');
    expect(readManualWeatherSnapshot(forged, '2026-07-17T12:00:00.000Z')).toMatchObject({
      source: 'manual',
      providerName: null,
    });
  });

  it('discloses provider assistance in the inspection summary', () => {
    expect(
      formatWeatherSummary({
        temperature: 83.6,
        temperatureUnit: 'f',
        conditions: 'Partly cloudy',
        source: 'provider',
        providerName: 'Open-Meteo',
      }),
    ).toBe('83.6°F · Partly cloudy · via Open-Meteo');
    expect(formatWeatherSummary({ source: 'provider', providerName: 'Open-Meteo' })).toBe(
      'Not recorded',
    );
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
