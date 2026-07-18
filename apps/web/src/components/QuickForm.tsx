import { useState, type FormEvent } from 'react';

export type Field = readonly [name: string, label: string, required: boolean];

export function QuickForm({
  fields,
  select,
  acceptImages,
  submitLabel,
  onSubmit,
}: {
  fields: Field[];
  select?: { name: string; label: string; options: Array<[string, string]> };
  submitLabel: string;
  acceptImages?: boolean;
  onSubmit: (fields: Record<string, string>, files: File[]) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement).entries()) as Record<
      string,
      string
    >;
    const fileInput = formElement.elements.namedItem('photos');
    const files =
      fileInput instanceof HTMLInputElement && fileInput.files ? Array.from(fileInput.files) : [];
    try {
      delete values.photos;
      await onSubmit(values, files);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save');
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
      {select && (
        <label>
          {select.label}
          <select name={select.name} required>
            {select.options.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.map(([name, label, required]) => (
        <label key={name}>
          {label}
          {name.toLowerCase().includes('notes') ? (
            <textarea name={name} required={required} rows={3} />
          ) : (
            <input name={name} required={required} />
          )}
        </label>
      ))}
      {acceptImages && (
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
            Photos are stored on this device immediately and upload after reconnection.
          </span>
        </label>
      )}
      <button className="button primary" disabled={working}>
        {working ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
