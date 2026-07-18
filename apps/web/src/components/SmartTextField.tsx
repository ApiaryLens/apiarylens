import { mergeFieldChoices } from '../field-intelligence.js';

export function SmartTextField({
  label,
  name,
  choices,
  recent = [],
  required = false,
  hint,
}: {
  label: string;
  name: string;
  choices: readonly string[];
  recent?: string[];
  required?: boolean;
  hint?: string;
}) {
  const options = mergeFieldChoices(recent, choices);
  return (
    <label>
      {label}
      <input name={name} list={`${name}-choices`} required={required} />
      <datalist id={`${name}-choices`}>
        {options.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <span className="field-hint">{hint ?? 'Choose a suggestion or type your own value.'}</span>
    </label>
  );
}
