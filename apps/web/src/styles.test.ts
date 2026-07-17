import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function declarationBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match?.[1]) throw new Error(`Missing ${selector} style rule`);
  return match[1];
}

describe('responsive document constraints', () => {
  it('does not force the document wider than the usable Windows viewport at 400% zoom', () => {
    const body = declarationBlock('body');

    // At a 320 CSS-pixel Electron viewport, a classic Windows scrollbar can leave
    // only 316 CSS pixels of document width. A fixed 320px body floor caused WIN-027.
    expect(body).toMatch(/min-width:\s*0\s*;/);
    expect(body).not.toMatch(/min-width:\s*\d+(?:\.\d+)?px\s*;/);
  });
});
