import { describe, expect, it } from 'vitest';

import { formatSelectorVerificationMessage, pickInitialActiveSelector } from './selector-verification.js';
import type { SelectorOption } from './types.js';

describe('selector verification helpers', () => {
  it('picks the first uniquely verified selector', () => {
    const selectors: SelectorOption[] = [
      { type: 'css', label: 'css', value: 'div:nth-of-type(1)' },
      { type: 'qa', label: 'data-testid', value: '[data-testid="cta"]' },
    ];
    const picked = pickInitialActiveSelector(selectors, {
      'div:nth-of-type(1)': { status: 'ambiguous', matchCount: 3 },
      '[data-testid="cta"]': { status: 'unique', matchCount: 1 },
    });
    expect(picked.value).toBe('[data-testid="cta"]');
  });

  it('formats ambiguous selector warnings', () => {
    expect(
      formatSelectorVerificationMessage({ status: 'ambiguous', matchCount: 4 }),
    ).toContain('4 elements');
  });
});
