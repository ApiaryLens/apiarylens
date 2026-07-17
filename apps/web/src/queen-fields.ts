export type QueenIdentifierKind = 'numbered_disc' | 'breeder_code' | 'colony_name' | 'other';
export type QueenMarkColor = 'white' | 'yellow' | 'red' | 'green' | 'blue';

const identifierLabels: Readonly<Record<QueenIdentifierKind, string>> = {
  numbered_disc: 'Numbered disc',
  breeder_code: 'Breeder code',
  colony_name: 'Name',
  other: 'Other',
};

export function queenColorForYear(year: number): QueenMarkColor {
  const finalDigit = Math.abs(year) % 10;
  if (finalDigit === 1 || finalDigit === 6) return 'white';
  if (finalDigit === 2 || finalDigit === 7) return 'yellow';
  if (finalDigit === 3 || finalDigit === 8) return 'red';
  if (finalDigit === 4 || finalDigit === 9) return 'green';
  return 'blue';
}

export function formatQueenIdentifier(kind: QueenIdentifierKind, value: string): string {
  const normalized = value.trim();
  return kind === 'other' ? normalized : `${identifierLabels[kind]}: ${normalized}`;
}
