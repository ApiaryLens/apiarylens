import { glossaryEntries, type GlossaryEntry } from './glossary-data.js';

export function glossaryTerm(id: string): GlossaryEntry | undefined {
  return glossaryEntries.find((entry) => entry.id === id);
}

export function searchGlossary(query: string): GlossaryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...glossaryEntries];
  const scored: Array<[GlossaryEntry, number]> = [];
  for (const entry of glossaryEntries) {
    const term = entry.term.toLowerCase();
    const aliases = entry.aliases.map((alias) => alias.toLowerCase());
    let score = 0;
    if (term === needle || aliases.includes(needle)) score = 4;
    else if (term.startsWith(needle) || aliases.some((alias) => alias.startsWith(needle)))
      score = 3;
    else if (term.includes(needle) || aliases.some((alias) => alias.includes(needle))) score = 2;
    else if (entry.definition.toLowerCase().includes(needle)) score = 1;
    if (score > 0) scored.push([entry, score]);
  }
  return scored
    .sort(([a, scoreA], [b, scoreB]) => scoreB - scoreA || a.term.localeCompare(b.term))
    .map(([entry]) => entry);
}
