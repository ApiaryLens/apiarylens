import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api.js';
import { db, type LocalResource } from '../../db.js';
import {
  lookupProviderConditions,
  openMeteoAttribution,
  openMeteoProviderName,
  providerHistoryLimitDays,
  type ProviderConditions,
} from './weather-assist.js';

type Provenance = { providerName: string; attribution: string; observedHour: string };

function coordinateKey(apiaryId: string): string {
  return `weatherAssist:coordinates:${apiaryId}`;
}

function providerProvenance(existingWeather: unknown): Provenance | undefined {
  if (!existingWeather || typeof existingWeather !== 'object') return undefined;
  const weather = existingWeather as Record<string, unknown>;
  if (weather.source !== 'provider') return undefined;
  return {
    providerName: String(weather.providerName ?? openMeteoProviderName),
    attribution: String(weather.attribution ?? openMeteoAttribution),
    observedHour: String(weather.observedAt ?? ''),
  };
}

/**
 * Optional provider-assisted fill for the manual weather snapshot (FB-011).
 * Everything here is additive: the lookup runs only after a consent checkbox
 * and an explicit button press, shares nothing beyond rounded coordinates and
 * the inspection hour, and every failure path ends at the same manual fields.
 * The standalone Windows profile keeps no external dependency, so the panel is
 * replaced there by an honest note (nothing leaves the computer).
 */
export function WeatherAssist({
  hives,
  existingWeather,
}: {
  hives: LocalResource[];
  existingWeather: unknown;
}) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [provenance, setProvenance] = useState<Provenance | undefined>(() =>
    providerProvenance(existingWeather),
  );

  // A saved inspection resets the form; the next one must start with clean
  // manual provenance and a fresh consent decision.
  useEffect(() => {
    const target = containerRef.current?.closest('form');
    if (!target) return;
    const onReset = () => {
      setProvenance(undefined);
      setMessage('');
      setConsent(false);
      setOpen(false);
    };
    target.addEventListener('reset', onReset);
    return () => target.removeEventListener('reset', onReset);
  }, []);

  if (api.desktopStandalone()) {
    return (
      <p className="field-hint">
        Provider weather lookup is not part of the standalone Windows profile, so nothing about your
        location ever leaves this computer. Every field above works offline.
      </p>
    );
  }

  function form(): HTMLFormElement | null {
    return containerRef.current?.closest('form') ?? null;
  }

  function selectedApiaryId(): string | undefined {
    const hiveId = (form()?.elements.namedItem('hiveId') as HTMLSelectElement | null)?.value;
    const hive = hives.find((candidate) => candidate.id === hiveId);
    return hive ? String(hive.data.apiaryId) : undefined;
  }

  async function togglePanel() {
    const next = !open;
    setOpen(next);
    setMessage('');
    if (!next) return;
    const apiaryId = selectedApiaryId();
    if (!apiaryId) return;
    const stored = (await db.settings.get(coordinateKey(apiaryId)))?.value as
      { latitude?: number; longitude?: number } | undefined;
    if (typeof stored?.latitude === 'number' && typeof stored.longitude === 'number') {
      setLatitude((current) => current || String(stored.latitude));
      setLongitude((current) => current || String(stored.longitude));
    }
  }

  function applyConditions(target: HTMLFormElement, conditions: ProviderConditions) {
    const setField = (name: string, value: string) => {
      const field = target.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (field) field.value = value;
    };
    if (conditions.temperature !== null) setField('temperature', String(conditions.temperature));
    setField('temperatureUnit', 'f');
    if (conditions.conditions) setField('conditions', conditions.conditions);
    if (conditions.humidity !== null) setField('humidity', String(conditions.humidity));
    if (conditions.windSpeed !== null) setField('windSpeed', String(conditions.windSpeed));
    setField('windSpeedUnit', 'mph');
    if (conditions.windDirection) setField('windDirection', conditions.windDirection);
  }

  async function lookup() {
    setMessage('');
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (
      latitude.trim() === '' ||
      longitude.trim() === '' ||
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude)
    ) {
      setMessage('Enter the apiary latitude and longitude first.');
      return;
    }
    const target = form();
    if (!target) return;
    if (!navigator.onLine) {
      setMessage(
        'You are offline, so the provider cannot be reached. The manual fields above keep working — nothing is lost.',
      );
      return;
    }
    const observedAtValue = (target.elements.namedItem('inspectedAt') as HTMLInputElement | null)
      ?.value;
    if (!observedAtValue) {
      setMessage('Enter the inspection date and time first.');
      return;
    }
    setWorking(true);
    try {
      const conditions = await lookupProviderConditions({
        explicitConsent: consent,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        observedAt: new Date(observedAtValue).toISOString(),
      });
      applyConditions(target, conditions);
      setProvenance({
        providerName: openMeteoProviderName,
        attribution: openMeteoAttribution,
        observedHour: conditions.observedHour,
      });
      const apiaryId = selectedApiaryId();
      if (remember && apiaryId) {
        await db.settings.put({
          key: coordinateKey(apiaryId),
          value: { latitude: parsedLatitude, longitude: parsedLongitude },
        });
      }
      setMessage(
        `Filled from ${openMeteoProviderName} for ${new Date(conditions.observedHour).toLocaleString()}. Review the values above and adjust anything before saving. ${openMeteoAttribution}.`,
      );
    } catch (caught) {
      setMessage(
        caught instanceof TypeError
          ? 'The weather provider could not be reached. The manual fields above keep working — nothing is lost.'
          : caught instanceof Error
            ? caught.message
            : 'Weather lookup did not complete. Enter conditions manually.',
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="weather-assist" ref={containerRef}>
      <input type="hidden" name="weatherSource" value={provenance ? 'provider' : 'manual'} />
      {provenance && (
        <>
          <input type="hidden" name="weatherProviderName" value={provenance.providerName} />
          <input type="hidden" name="weatherAttribution" value={provenance.attribution} />
          <input type="hidden" name="weatherObservedAt" value={provenance.observedHour} />
        </>
      )}
      <button
        type="button"
        className="button secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => void togglePanel()}
      >
        {open ? 'Hide weather lookup' : 'Fill from a weather provider…'}
      </button>
      {open && (
        <div id={panelId} className="weather-assist-panel">
          <p className="field-hint">
            With your consent, ApiaryLens asks {openMeteoProviderName} (a keyless public weather
            service) for the conditions at this time and place — current or up to about{' '}
            {providerHistoryLimitDays} days back. Only the inspection hour and coordinates rounded
            to about a kilometer are shared: never hive records, names, notes, or photos. This is
            optional; an inspection always saves without it.
          </p>
          <div className="form-grid">
            <label>
              Apiary latitude
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                value={latitude}
                onChange={(event) => setLatitude(event.currentTarget.value)}
              />
            </label>
            <label>
              Apiary longitude
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                value={longitude}
                onChange={(event) => setLongitude(event.currentTarget.value)}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.currentTarget.checked)}
            />
            Remember these coordinates for this apiary on this device only
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.currentTarget.checked)}
            />
            I agree to share this location and the inspection hour with {openMeteoProviderName}
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!consent || working}
            onClick={() => void lookup()}
          >
            {working ? 'Asking the provider…' : 'Get conditions'}
          </button>
        </div>
      )}
      <p className="field-hint" role="status">
        {message}
      </p>
    </div>
  );
}
