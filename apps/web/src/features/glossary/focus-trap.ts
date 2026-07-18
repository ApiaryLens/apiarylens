export const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Decides where a Tab press inside a modal dialog must move focus so it never
 * escapes the dialog. Returns the element to focus, or undefined when the
 * browser's default in-dialog order is already correct.
 */
export function nextTrapTarget<T>(
  focusable: readonly T[],
  active: T | null | undefined,
  backwards: boolean,
): T | undefined {
  if (focusable.length === 0) return undefined;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const index = active == null ? -1 : focusable.indexOf(active);
  // Focus is on a programmatically focused element (tabindex="-1") or outside
  // the dialog entirely: re-enter the cycle at its nearest edge.
  if (index === -1) return backwards ? last : first;
  if (!backwards && index === focusable.length - 1) return first;
  if (backwards && index === 0) return last;
  return undefined;
}
