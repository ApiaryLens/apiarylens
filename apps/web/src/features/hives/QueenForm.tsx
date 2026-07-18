import { useState, type FormEvent } from 'react';
import type { LocalResource } from '../../db.js';
import {
  formatQueenIdentifier,
  queenColorForYear,
  type QueenIdentifierKind,
} from '../../queen-fields.js';

export function QueenForm({
  hives,
  onSubmit,
}: {
  hives: LocalResource[];
  onSubmit: (fields: {
    hiveId: string;
    identifier: string;
    marked: boolean;
    markColor: string | null;
    year: number | null;
    source: string | null;
    introductionDate: string;
    notes: string | null;
  }) => Promise<void>;
}) {
  const currentYear = new Date().getFullYear();
  const [markMode, setMarkMode] = useState<'year' | 'color' | 'unmarked'>('year');
  const [year, setYear] = useState(currentYear);
  const [color, setColor] = useState('white');
  const [identifierKind, setIdentifierKind] = useState<QueenIdentifierKind>('numbered_disc');
  const [sourceKind, setSourceKind] = useState('unknown');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const suggestedColor = queenColorForYear(year);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const chosenColor =
        markMode === 'year'
          ? suggestedColor
          : markMode === 'color'
            ? color === 'other'
              ? String(values.get('customMarkColor')).trim()
              : color
            : null;
      const source =
        sourceKind === 'other'
          ? String(values.get('customSource')).trim()
          : sourceKind === 'unknown'
            ? null
            : sourceKind.replaceAll('_', ' ');
      await onSubmit({
        hiveId: String(values.get('hiveId')),
        identifier: formatQueenIdentifier(identifierKind, String(values.get('identifierValue'))),
        marked: markMode !== 'unmarked',
        markColor: chosenColor || null,
        year: markMode === 'year' ? year : null,
        source: source || null,
        introductionDate: String(values.get('introductionDate')),
        notes: String(values.get('notes')).trim() || null,
      });
      form.reset();
      setMarkMode('year');
      setYear(currentYear);
      setColor('white');
      setIdentifierKind('numbered_disc');
      setSourceKind('unknown');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save queen');
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className="form compact" onSubmit={(event) => void submit(event)}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        Hive
        <select name="hiveId" required>
          {hives.map((hive) => (
            <option key={hive.id} value={hive.id}>
              {String(hive.data.name)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identifier type
        <select
          value={identifierKind}
          onChange={(event) => setIdentifierKind(event.target.value as QueenIdentifierKind)}
        >
          <option value="numbered_disc">Numbered disc or tag</option>
          <option value="breeder_code">Breeder code</option>
          <option value="colony_name">Queen name</option>
          <option value="other">Other identifier</option>
        </select>
      </label>
      <label>
        {identifierKind === 'other' ? 'Other identifier' : 'Identifier value'}
        <input name="identifierValue" required maxLength={90} />
      </label>
      <fieldset>
        <legend>Mark recorded by</legend>
        <label>
          <input
            type="radio"
            name="markMode"
            value="year"
            checked={markMode === 'year'}
            onChange={() => setMarkMode('year')}
          />
          Year (suggest the standard color)
        </label>
        <label>
          <input
            type="radio"
            name="markMode"
            value="color"
            checked={markMode === 'color'}
            onChange={() => setMarkMode('color')}
          />
          Color
        </label>
        <label>
          <input
            type="radio"
            name="markMode"
            value="unmarked"
            checked={markMode === 'unmarked'}
            onChange={() => setMarkMode('unmarked')}
          />
          Unmarked
        </label>
      </fieldset>
      {markMode === 'year' && (
        <label>
          Queen year
          <input
            name="year"
            type="number"
            min="1900"
            max="2200"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            required
          />
          <span className="field-hint">
            International marking color for {year}: {suggestedColor}
          </span>
        </label>
      )}
      {markMode === 'color' && (
        <>
          <label>
            Mark color
            <select value={color} onChange={(event) => setColor(event.target.value)}>
              <option value="white">White</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
              <option value="other">Other color</option>
            </select>
          </label>
          {color === 'other' && (
            <label>
              Other mark color
              <input name="customMarkColor" required maxLength={40} />
            </label>
          )}
        </>
      )}
      <label>
        Source
        <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>
          <option value="unknown">Unknown or not recorded</option>
          <option value="raised_in_apiary">Raised in this apiary</option>
          <option value="purchased_breeder">Purchased from breeder</option>
          <option value="swarm_or_removal">Swarm or removal</option>
          <option value="other">Other source</option>
        </select>
      </label>
      {sourceKind === 'other' && (
        <label>
          Other source
          <input name="customSource" required maxLength={500} />
        </label>
      )}
      <label>
        Introduction date
        <input name="introductionDate" type="date" />
      </label>
      <label>
        Notes
        <textarea name="notes" rows={3} />
      </label>
      <button className="button primary" disabled={working}>
        {working ? 'Saving…' : 'Add queen'}
      </button>
    </form>
  );
}
