export function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function yesNo(value: unknown) {
  return value === true ? 'Yes' : value === false ? 'No' : 'Not recorded';
}
