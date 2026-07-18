import { describe, expect, it } from 'vitest';
import { nextTrapTarget } from './focus-trap.js';

describe('glossary dialog focus trap', () => {
  const focusable = ['close', 'search'] as const;

  it('wraps forward from the last focusable control to the first', () => {
    expect(nextTrapTarget(focusable, 'search', false)).toBe('close');
    expect(nextTrapTarget(focusable, 'close', false)).toBeUndefined();
  });

  it('wraps backward from the first focusable control to the last', () => {
    expect(nextTrapTarget(focusable, 'close', true)).toBe('search');
    expect(nextTrapTarget(focusable, 'search', true)).toBeUndefined();
  });

  it('pulls focus back into the cycle from tabindex=-1 or outside elements', () => {
    expect(nextTrapTarget(focusable, 'glossary-entry', false)).toBe('close');
    expect(nextTrapTarget(focusable, 'glossary-entry', true)).toBe('search');
    expect(nextTrapTarget(focusable, null, false)).toBe('close');
  });

  it('yields nothing when the dialog has no focusable controls', () => {
    expect(nextTrapTarget([], 'anything', false)).toBeUndefined();
  });
});
