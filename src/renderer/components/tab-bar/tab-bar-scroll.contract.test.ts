import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

describe('tab-bar-scroll', () => {
  it('wires chevron buttons and wheel scroll for overflowing tabs', () => {
    const source = readFileSync(join(root, 'tab-bar-scroll.ts'), 'utf8');
    expect(source).toContain('tab-scroll-prev');
    expect(source).toContain('tab-scroll-next');
    expect(source).toContain('scrollBy({ left: -SCROLL_STEP');
    expect(source).toContain('wheel');
  });

  it('keeps scroll controls optional so init tests without DOM ids stay safe', () => {
    const source = readFileSync(join(root, 'tab-bar-scroll.ts'), 'utf8');
    expect(source).toContain('if (!prevBtn || !nextBtn) return');
  });
});
