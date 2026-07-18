import { useGlossary } from './glossary-context.js';

export function GlossaryLink({ term, label }: { term: string; label: string }) {
  const glossary = useGlossary();
  return (
    <button
      type="button"
      className="glossary-link"
      aria-label={`Open glossary: ${label}`}
      title={`What does “${label}” mean?`}
      onClick={() => glossary.open(term)}
    >
      ?
    </button>
  );
}
