import { useEffect, useMemo, useRef, useState } from 'react';
import { glossaryCategories, type GlossaryEntry } from './glossary-data.js';
import { glossaryTerm, searchGlossary } from './glossary.js';

export function GlossaryPanel({
  initialTermId,
  onClose,
}: {
  initialTermId?: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = initialTermId ? glossaryTerm(initialTermId) : undefined;
  const results = useMemo(() => searchGlossary(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!selected) {
      searchRef.current?.focus();
      return;
    }
    const anchor = listRef.current?.querySelector<HTMLElement>(`#glossary-term-${selected.id}`);
    anchor?.scrollIntoView({ block: 'start' });
    anchor?.focus();
  }, [selected]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, GlossaryEntry[]>();
    for (const entry of results) {
      const bucket = byCategory.get(entry.category) ?? [];
      bucket.push(entry);
      byCategory.set(entry.category, bucket);
    }
    return glossaryCategories
      .map((category) => [category, byCategory.get(category) ?? []] as const)
      .filter(([, entries]) => entries.length > 0);
  }, [results]);

  return (
    <div
      className="modal-backdrop glossary-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="glossary-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section className="card glossary-panel">
        <header className="glossary-header">
          <div>
            <span className="eyebrow">Beekeeping glossary</span>
            <h2 id="glossary-title">Look up a term</h2>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            aria-label="Close glossary"
          >
            Close
          </button>
        </header>
        <label className="glossary-search">
          Search terms
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="brood box, super, queen excluder…"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <p className="field-hint" role="status">
          {searching
            ? `${results.length} matching term${results.length === 1 ? '' : 's'}`
            : `${results.length} terms, available offline`}
        </p>
        <div className="glossary-list" ref={listRef}>
          {results.length === 0 ? (
            <p className="empty">No matching terms. Try a shorter word or a common name.</p>
          ) : (
            grouped.map(([category, entries]) => (
              <section key={category} aria-label={category}>
                <h3>{category}</h3>
                <dl>
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      id={`glossary-term-${entry.id}`}
                      tabIndex={-1}
                      className={
                        selected?.id === entry.id
                          ? 'glossary-entry glossary-entry-selected'
                          : 'glossary-entry'
                      }
                    >
                      <dt>{entry.term}</dt>
                      <dd>
                        {entry.definition}
                        {entry.aliases.length > 0 && (
                          <small>Also called: {entry.aliases.join(', ')}</small>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
