import { describe, expect, it } from 'vitest';
import { formatWeatherSummary } from './weather-fields.js';

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
});
