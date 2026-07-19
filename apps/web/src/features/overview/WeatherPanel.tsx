import type { LocalResource } from '../../db.js';
import { Empty } from '../../components/Empty.js';
import { conditionsFreshness, weatherGlyph, type WeatherGlyph } from './weather-block.js';

/**
 * Block: graphic conditions hero (owner dashboard iteration #1). Renders the
 * newest inspection weather snapshot as a condition icon + temperature hero
 * with a facts row, in V2's type and color system. The data flow is unchanged
 * from the #86 work: snapshots come only from saved inspections (manual or
 * consented provider), the reading's age is always disclosed, and the block
 * renders an honest empty state rather than a fabricated forecast.
 */
export function WeatherPanel({
  inspections,
  hiveNames,
}: {
  inspections: LocalResource[];
  hiveNames: Map<string, string>;
}) {
  const withWeather = [...inspections]
    .filter((record) => record.data.weather && typeof record.data.weather === 'object')
    .sort((a, b) => String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)));
  const latest = withWeather[0];
  const weather = latest?.data.weather as Record<string, unknown> | undefined;
  const conditions = weather?.conditions ? String(weather.conditions) : '';
  const glyph = weatherGlyph(conditions);
  const temperature =
    weather && typeof weather.temperature === 'number'
      ? `${weather.temperature}°${String(weather.temperatureUnit ?? 'f').toUpperCase()}`
      : null;
  const wind =
    weather && typeof weather.windSpeed === 'number'
      ? `${weather.windSpeed} ${String(weather.windSpeedUnit ?? 'mph')}${weather.windDirection ? ` ${String(weather.windDirection).toUpperCase()}` : ''}`
      : null;
  const humidity = weather && typeof weather.humidity === 'number' ? `${weather.humidity}%` : null;
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Conditions</h2>
        <span className="spacer"></span>
        {latest && (
          <span className="sub-t">
            {hiveNames.get(String(latest.data.hiveId)) ?? 'hive'} ·{' '}
            {conditionsFreshness(String(latest.data.inspectedAt))}
          </span>
        )}
      </div>
      {weather && latest ? (
        <div className="panel-b">
          <div className="wx-hero">
            <WeatherIcon glyph={glyph} />
            <div>
              {temperature && <span className="wx-temp">{temperature}</span>}
              <span className="wx-cond">{conditions || 'Conditions not described'}</span>
            </div>
            <dl className="wx-facts">
              {wind && (
                <div>
                  <dt>Wind</dt>
                  <dd>{wind}</dd>
                </div>
              )}
              {humidity && (
                <div>
                  <dt>Humidity</dt>
                  <dd>{humidity}</dd>
                </div>
              )}
              <div>
                <dt>Source</dt>
                <dd>
                  <span className={`tag ${weather.source === 'provider' ? 'mut' : 'ok'}`}>
                    {weather.source === 'provider'
                      ? `PROVIDER · ${String(weather.providerName ?? '')}`.trim()
                      : 'MANUAL'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : (
        <div className="panel-b">
          <Empty text="Weather recorded with an inspection will appear here." />
        </div>
      )}
      <div className="panel-note">
        <span className="sub-t">
          Conditions are the snapshot saved with an inspection — manual entry always works offline;
          the optional provider assist in the inspection form requires explicit location consent
          (FB-011).
        </span>
      </div>
    </div>
  );
}

/**
 * Inline stroke icons in the V2 series color — no external assets, correct in
 * both themes, and always accompanied by the condition text (aria-hidden).
 */
function WeatherIcon({ glyph }: { glyph: WeatherGlyph }) {
  return (
    <svg
      className="wx-icon"
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph === 'sun' && (
        <g>
          <circle cx="28" cy="28" r="10" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <line
                key={angle}
                x1={28 + Math.cos(rad) * 15}
                y1={28 + Math.sin(rad) * 15}
                x2={28 + Math.cos(rad) * 21}
                y2={28 + Math.sin(rad) * 21}
              />
            );
          })}
        </g>
      )}
      {glyph === 'partly' && (
        <g>
          <circle cx="21" cy="21" r="8" />
          <line x1="21" y1="7" x2="21" y2="10" />
          <line x1="7" y1="21" x2="10" y2="21" />
          <line x1="11" y1="11" x2="13.2" y2="13.2" />
          <line x1="31" y1="11" x2="28.8" y2="13.2" />
          <path
            className="wx-fill"
            d="M20 42h18a8 8 0 1 0-1.6-15.8A11 11 0 0 0 15.5 30 6.5 6.5 0 0 0 20 42z"
          />
        </g>
      )}
      {glyph === 'cloud' && (
        <path
          className="wx-fill"
          d="M16 40h22a9 9 0 1 0-1.8-17.8A13 13 0 0 0 11 26.5 7.5 7.5 0 0 0 16 40z"
        />
      )}
      {(glyph === 'rain' || glyph === 'storm' || glyph === 'snow') && (
        <path
          className="wx-fill"
          d="M16 33h22a9 9 0 1 0-1.8-17.8A13 13 0 0 0 11 19.5 7.5 7.5 0 0 0 16 33z"
        />
      )}
      {glyph === 'rain' && (
        <g>
          <line x1="19" y1="39" x2="16.5" y2="46" />
          <line x1="28" y1="39" x2="25.5" y2="46" />
          <line x1="37" y1="39" x2="34.5" y2="46" />
        </g>
      )}
      {glyph === 'storm' && <path d="M28 36l-5 8h6l-4 8" fill="none" />}
      {glyph === 'snow' && (
        <g>
          <line x1="19" y1="42" x2="19" y2="42.01" />
          <line x1="28" y1="46" x2="28" y2="46.01" />
          <line x1="37" y1="42" x2="37" y2="42.01" />
        </g>
      )}
      {glyph === 'fog' && (
        <g>
          <path
            className="wx-fill"
            d="M16 30h22a9 9 0 1 0-1.8-17.8A13 13 0 0 0 11 16.5 7.5 7.5 0 0 0 16 30z"
          />
          <line x1="12" y1="38" x2="42" y2="38" />
          <line x1="16" y1="45" x2="38" y2="45" />
        </g>
      )}
      {glyph === 'wind' && (
        <g>
          <path d="M8 22h26a6 6 0 1 0-6-6" fill="none" />
          <path d="M8 30h34a6 6 0 1 1-6 6" fill="none" />
          <path d="M8 38h18" fill="none" />
        </g>
      )}
      {glyph === 'unknown' && (
        <g>
          <path d="M28 14a13 13 0 0 1 13 13c0 8-8 9-10 13" fill="none" />
          <line x1="30" y1="46" x2="30" y2="46.01" />
        </g>
      )}
    </svg>
  );
}
