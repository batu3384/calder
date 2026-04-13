import { describe, expect, it } from 'vitest';
import { shouldRouteBrowserOpenIntent } from './browser-tab-open-intent';

describe('shouldRouteBrowserOpenIntent', () => {
  it('routes target blank links', () => {
    expect(shouldRouteBrowserOpenIntent({ targetAttr: '_blank', button: 0 })).toBe(true);
  });

  it('routes middle-click navigation', () => {
    expect(shouldRouteBrowserOpenIntent({ button: 1 })).toBe(true);
  });

  it('routes modifier-assisted navigation', () => {
    expect(shouldRouteBrowserOpenIntent({ button: 0, metaKey: true })).toBe(true);
    expect(shouldRouteBrowserOpenIntent({ button: 0, ctrlKey: true })).toBe(true);
    expect(shouldRouteBrowserOpenIntent({ button: 0, shiftKey: true })).toBe(true);
  });

  it('ignores regular primary clicks in the current page', () => {
    expect(shouldRouteBrowserOpenIntent({ targetAttr: '', button: 0 })).toBe(false);
  });
});
