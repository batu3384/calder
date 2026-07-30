import { describe, expect, it } from 'vitest';

import { isCrossOriginFrameSrc } from './browser-tab-capture-guards';

describe('browser capture guards', () => {
  it('treats same-origin and about:blank iframe src values as inspectable', () => {
    expect(isCrossOriginFrameSrc('about:blank', 'https://app.local/page')).toBe(false);
    expect(isCrossOriginFrameSrc('/embed', 'https://app.local/page')).toBe(false);
  });

  it('treats cross-origin iframe src values as blocked', () => {
    expect(isCrossOriginFrameSrc('https://example.com/embed', 'https://app.local/page')).toBe(true);
  });

  it('ignores empty iframe src values', () => {
    expect(isCrossOriginFrameSrc('', 'https://app.local/page')).toBe(false);
    expect(isCrossOriginFrameSrc(undefined, 'https://app.local/page')).toBe(false);
  });
});
