import { useState, type FormEvent } from 'react';
import { queueCreate, queueUpdate, stageImage, type LocalResource } from '../../db.js';
import { readManualWeatherSnapshot } from '../../weather-fields.js';
import { fieldChoices } from '../../field-intelligence.js';
import { GlossaryLink } from '../glossary/GlossaryLink.js';
import { toLocalDateTime } from './format.js';

export function InspectionForm({
  organizationId,
  hives,
  editing,
  onCancel,
  onSaved,
}: {
  organizationId: string;
  hives: LocalResource[];
  editing: LocalResource | undefined;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const form = event.currentTarget;
    const values = new FormData(form);
    const files = Array.from((form.elements.namedItem('photos') as HTMLInputElement).files ?? []);
    const observed = (name: string) =>
      values.get(name) === '' ? null : values.get(name) === 'yes';
    const inspectedAt = new Date(String(values.get('inspectedAt'))).toISOString();
    const weather = readManualWeatherSnapshot(values, inspectedAt);
    const payload = {
      hiveId: String(values.get('hiveId')),
      inspectedAt,
      inspectorName: String(values.get('inspectorName')),
      state: String(values.get('state')),
      notes: String(values.get('notes') ?? ''),
      temperament: String(values.get('temperament')),
      populationStrength: String(values.get('populationStrength')),
      queenSeen: observed('queenSeen'),
      eggsOrLarvae: observed('eggsOrLarvae'),
      broodCondition: String(values.get('broodCondition') ?? ''),
      stores: String(values.get('stores') ?? ''),
      followUpNotes: String(values.get('followUpNotes') ?? ''),
      weather,
    };
    try {
      let inspectionId: string;
      if (editing) {
        await queueUpdate(editing, payload);
        inspectionId = editing.id;
      } else {
        inspectionId = await queueCreate(organizationId, 'inspection', payload);
        if (payload.followUpNotes.trim()) {
          await queueCreate(organizationId, 'followUp', {
            hiveId: payload.hiveId,
            inspectionId,
            description: payload.followUpNotes,
          });
        }
      }
      for (const file of files)
        await stageImage(organizationId, payload.hiveId, inspectionId, file);
      form.reset();
      onSaved(
        payload.state === 'complete'
          ? 'Inspection completed and saved offline.'
          : 'Inspection draft saved offline.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the inspection');
    } finally {
      setWorking(false);
    }
  }
  const data = editing?.data;
  return (
    <form
      className="form inspection-form"
      key={editing?.key ?? 'new'}
      onSubmit={(event) => void submit(event)}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-grid">
        <label>
          Hive
          <select name="hiveId" required defaultValue={String(data?.hiveId ?? hives[0]?.id)}>
            {hives.map((hive) => (
              <option key={hive.id} value={hive.id}>
                {String(hive.data.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date and time
          <input
            name="inspectedAt"
            type="datetime-local"
            required
            defaultValue={toLocalDateTime(String(data?.inspectedAt ?? new Date().toISOString()))}
          />
        </label>
        <label>
          Inspector
          <input name="inspectorName" required defaultValue={String(data?.inspectorName ?? '')} />
        </label>
        <label>
          Progress
          <select name="state" defaultValue={String(data?.state ?? 'draft')}>
            <option value="draft">Draft — finish later</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label>
          Temperament
          <select name="temperament" defaultValue={String(data?.temperament ?? 'not_observed')}>
            <option value="not_observed">Not observed</option>
            <option value="calm">Calm</option>
            <option value="normal">Normal</option>
            <option value="defensive">Defensive</option>
          </select>
        </label>
        <label>
          Population
          <select
            name="populationStrength"
            defaultValue={String(data?.populationStrength ?? 'not_observed')}
          >
            <option value="not_observed">Not observed</option>
            <option value="weak">Weak</option>
            <option value="moderate">Moderate</option>
            <option value="strong">Strong</option>
          </select>
        </label>
        <ObservedField name="queenSeen" label="Queen seen" value={data?.queenSeen} />
        <ObservedField
          name="eggsOrLarvae"
          label="Eggs or larvae present"
          value={data?.eggsOrLarvae}
        />
      </div>
      <label>
        Brood condition <GlossaryLink term="brood" label="Brood" />
        <input
          name="broodCondition"
          list="inspection-brood-options"
          defaultValue={String(data?.broodCondition ?? '')}
        />
        <datalist id="inspection-brood-options">
          {fieldChoices.broodCondition.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <label>
        Stores <GlossaryLink term="stores" label="Stores" />
        <input
          name="stores"
          list="inspection-stores-options"
          defaultValue={String(data?.stores ?? '')}
        />
        <datalist id="inspection-stores-options">
          {fieldChoices.stores.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <label>
        Inspection notes
        <textarea name="notes" rows={4} defaultValue={String(data?.notes ?? '')} />
      </label>
      <label>
        Follow-up notes
        <textarea name="followUpNotes" rows={3} defaultValue={String(data?.followUpNotes ?? '')} />
      </label>
      <fieldset>
        <legend>Optional manual weather snapshot</legend>
        <p className="field-hint">
          Works without a connection and does not share your location with a weather provider.
        </p>
        <div className="form-grid">
          <label>
            Temperature
            <input
              name="temperature"
              type="number"
              step="any"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).temperature ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Unit
            <select
              name="temperatureUnit"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).temperatureUnit ?? 'f')
                  : 'f'
              }
            >
              <option value="f">°F</option>
              <option value="c">°C</option>
            </select>
          </label>
          <label>
            Conditions
            <input
              name="conditions"
              list="weather-condition-options"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).conditions ?? '')
                  : ''
              }
            />
            <datalist id="weather-condition-options">
              <option value="Clear" />
              <option value="Partly cloudy" />
              <option value="Overcast" />
              <option value="Light rain" />
              <option value="Rain" />
              <option value="Thunderstorms" />
              <option value="Fog" />
              <option value="Smoke or haze" />
            </datalist>
          </label>
          <label>
            Relative humidity (%)
            <input
              name="humidity"
              type="number"
              min="0"
              max="100"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).humidity ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Wind speed
            <input
              name="windSpeed"
              type="number"
              min="0"
              max="300"
              step="any"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).windSpeed ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Wind unit
            <select
              name="windSpeedUnit"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).windSpeedUnit ?? 'mph')
                  : 'mph'
              }
            >
              <option value="mph">mph</option>
              <option value="kph">km/h</option>
            </select>
          </label>
          <label>
            Wind direction
            <select
              name="windDirection"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).windDirection ?? '')
                  : ''
              }
            >
              <option value="">Not recorded</option>
              <option value="calm">Calm</option>
              <option value="n">North</option>
              <option value="ne">Northeast</option>
              <option value="e">East</option>
              <option value="se">Southeast</option>
              <option value="s">South</option>
              <option value="sw">Southwest</option>
              <option value="w">West</option>
              <option value="nw">Northwest</option>
              <option value="variable">Variable</option>
            </select>
          </label>
        </div>
      </fieldset>
      <label>
        Inspection photos
        <input
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          capture="environment"
        />
        <span className="field-hint">
          Originals and thumbnails are staged immediately, even without a connection.
        </span>
      </label>
      <div className="button-row">
        <button className="button primary" disabled={working}>
          {working ? 'Saving…' : editing ? 'Save changes' : 'Save inspection'}
        </button>
        {editing && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}

function ObservedField({ name, label, value }: { name: string; label: string; value: unknown }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value === true ? 'yes' : value === false ? 'no' : ''}>
        <option value="">Not recorded</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}
