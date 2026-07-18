import { describe, expect, it } from 'vitest';
import { glossaryCategories, glossaryEntries } from './glossary-data.js';
import { glossaryTerm, searchGlossary } from './glossary.js';

describe('beekeeping glossary', () => {
  it('covers the required domains with unique, categorized terms', () => {
    const ids = glossaryEntries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of glossaryEntries) {
      expect(glossaryCategories).toContain(entry.category);
      expect(entry.definition.length).toBeGreaterThan(40);
    }
    for (const required of [
      'brood-box',
      'super',
      'queen-excluder',
      'inspection',
      'varroa-mite',
      'sugar-syrup',
      'withdrawal-period',
      'honey-harvest',
    ]) {
      expect(glossaryTerm(required)).toBeDefined();
    }
  });

  it('resolves the term ids product help affordances deep-link to', () => {
    for (const linked of ['brood', 'stores', 'queen-marking', 'alcohol-wash', 'frame']) {
      expect(glossaryTerm(linked)).toBeDefined();
    }
  });

  it('finds terms by name, alias, and definition text, ranked by match strength', () => {
    expect(searchGlossary('queen excluder')[0]?.id).toBe('queen-excluder');
    expect(searchGlossary('deep')[0]?.id).toBe('brood-box');
    expect(searchGlossary('sugar roll')[0]?.id).toBe('alcohol-wash');
    expect(searchGlossary('2:1')[0]?.id).toBe('sugar-syrup');
    const mummies = searchGlossary('mummies');
    expect(mummies.map((entry) => entry.id)).toContain('chalkbrood');
    expect(searchGlossary('')).toHaveLength(glossaryEntries.length);
    expect(searchGlossary('zzzz-not-a-term')).toHaveLength(0);
  });
});
