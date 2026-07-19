import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocalResource } from '../../db.js';
import { AboutPage } from '../about/AboutPage.js';
import { WeatherPanel } from './WeatherPanel.js';

let sequence = 0;
function inspection(data: Record<string, unknown>): LocalResource {
  sequence += 1;
  return {
    key: `key-${sequence}`,
    id: `id-${sequence}`,
    organizationId: 'org-1',
    entityType: 'inspection',
    version: 1,
    createdAt: '2026-07-18T09:00:00.000Z',
    updatedAt: '2026-07-18T09:00:00.000Z',
    deletedAt: null,
    syncState: 'synchronized',
    data,
  };
}

describe('graphic weather panel rendering', () => {
  it('renders the hero with icon, temperature, condition text, and source', () => {
    const html = renderToStaticMarkup(
      <WeatherPanel
        inspections={[
          inspection({
            hiveId: 'h1',
            inspectedAt: '2026-07-18T09:41:00.000Z',
            weather: {
              temperature: 74,
              temperatureUnit: 'f',
              conditions: 'Partly cloudy',
              humidity: 58,
              windSpeed: 5,
              windSpeedUnit: 'mph',
              windDirection: 'nw',
              source: 'manual',
            },
          }),
        ]}
        hiveNames={new Map([['h1', 'Queen Anne']])}
      />,
    );
    expect(html).toContain('wx-hero');
    expect(html).toContain('wx-icon');
    expect(html).toContain('74°F');
    // Condition is conveyed in text, never icon-only.
    expect(html).toContain('Partly cloudy');
    expect(html).toContain('5 mph NW');
    expect(html).toContain('58%');
    expect(html).toContain('MANUAL');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders an honest empty state without weather data', () => {
    const html = renderToStaticMarkup(<WeatherPanel inspections={[]} hiveNames={new Map()} />);
    expect(html).toContain('Weather recorded with an inspection will appear here.');
    expect(html).not.toContain('wx-temp');
  });

  it('discloses a provider-assisted snapshot source', () => {
    const html = renderToStaticMarkup(
      <WeatherPanel
        inspections={[
          inspection({
            hiveId: 'h1',
            inspectedAt: '2026-07-18T09:41:00.000Z',
            weather: {
              temperature: 21,
              temperatureUnit: 'c',
              conditions: 'rain showers',
              source: 'provider',
              providerName: 'Open-Meteo',
            },
          }),
        ]}
        hiveNames={new Map([['h1', 'Queen Anne']])}
      />,
    );
    expect(html).toContain('PROVIDER · Open-Meteo');
    expect(html).toContain('21°C');
  });
});

describe('About page rendering', () => {
  it('renders identity, release links, and docs while online', () => {
    const html = renderToStaticMarkup(<AboutPage offline={false} />);
    expect(html).toContain('About ApiaryLens');
    expect(html).toContain('Preview 1');
    expect(html).toContain('https://apiarylens.org/docs/');
    expect(html).toContain('github.com/ApiaryLens/apiarylens/releases');
    expect(html).toContain('Open the beekeeping glossary');
  });

  it('disables external links honestly while offline, keeping the page usable', () => {
    const html = renderToStaticMarkup(<AboutPage offline={true} />);
    expect(html).toContain('OFFLINE — LINKS DISABLED');
    expect(html).toContain('about-link-disabled');
    expect(html).not.toContain('<a href="https://apiarylens.org/docs/"');
    // Identity and the offline glossary stay available.
    expect(html).toContain('About ApiaryLens');
    expect(html).toContain('Open the beekeeping glossary');
  });
});
