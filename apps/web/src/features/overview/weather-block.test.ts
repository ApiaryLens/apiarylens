import { describe, expect, it } from 'vitest';
import { conditionsFreshness, weatherGlyph } from './weather-block.js';

describe('graphic weather block (owner dashboard iteration #1)', () => {
  it('maps free-text conditions to an icon', () => {
    expect(weatherGlyph('Sunny')).toBe('sun');
    expect(weatherGlyph('clear')).toBe('sun');
    expect(weatherGlyph('Partly cloudy')).toBe('partly');
    expect(weatherGlyph('scattered clouds')).toBe('partly');
    expect(weatherGlyph('Overcast')).toBe('cloud');
    expect(weatherGlyph('light rain showers')).toBe('rain');
    expect(weatherGlyph('drizzle')).toBe('rain');
    expect(weatherGlyph('thunderstorm')).toBe('storm');
    expect(weatherGlyph('Snow flurries')).toBe('snow');
    expect(weatherGlyph('fog')).toBe('fog');
    expect(weatherGlyph('gusty wind')).toBe('wind');
  });

  it('never invents an icon for unrecognized or empty conditions', () => {
    expect(weatherGlyph('')).toBe('unknown');
    expect(weatherGlyph('   ')).toBe('unknown');
    expect(weatherGlyph('smoke on the water')).toBe('fog');
    expect(weatherGlyph('nectar flow heavy')).toBe('unknown');
  });

  it('always discloses how old the snapshot is', () => {
    const now = new Date('2026-07-18T12:00:00');
    expect(conditionsFreshness('2026-07-18T09:41:00', now)).toMatch(/^recorded today /);
    expect(conditionsFreshness('2026-07-17T18:00:00', now)).toBe('recorded yesterday');
    expect(conditionsFreshness('2026-07-11T12:00:00', now)).toBe('recorded 7 days ago');
    expect(conditionsFreshness('2026-05-01T12:00:00', now)).toBe(
      `recorded ${new Date('2026-05-01T12:00:00').toLocaleDateString()}`,
    );
    expect(conditionsFreshness('not-a-date', now)).toBe('recorded time unknown');
  });
});
