import { describe, expect, it } from 'vitest';
import { formatQueenIdentifier, queenColorForYear } from './queen-fields.js';

describe('queen field intelligence', () => {
  it('maps the international five-year marking cycle', () => {
    expect(queenColorForYear(2026)).toBe('white');
    expect(queenColorForYear(2027)).toBe('yellow');
    expect(queenColorForYear(2028)).toBe('red');
    expect(queenColorForYear(2029)).toBe('green');
    expect(queenColorForYear(2030)).toBe('blue');
  });

  it('preserves explicit identifier context while leaving Other user-defined', () => {
    expect(formatQueenIdentifier('numbered_disc', '42')).toBe('Numbered disc: 42');
    expect(formatQueenIdentifier('breeder_code', '  VA-12 ')).toBe('Breeder code: VA-12');
    expect(formatQueenIdentifier('other', '  blue dot left wing ')).toBe('blue dot left wing');
  });
});
