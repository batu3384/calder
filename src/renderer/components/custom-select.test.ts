import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./custom-select.ts', import.meta.url), 'utf-8');

describe('custom select floating surface contract', () => {
  it('anchors dropdowns through the shared floating surface helper', () => {
    expect(source).toContain("import { anchorFloatingSurface } from './floating-surface.js';");
    expect(source).toContain('let floatingCleanup');
    expect(source).toContain('anchorFloatingSurface(trigger, dropdown');
    expect(source).toContain('floatingCleanup?.()');
  });
});
