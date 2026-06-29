import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf-8');

describe('context inspector provider label contract', () => {
  it('keeps right-rail signal logic independent from provider chip chrome', () => {
    expect(source).toContain("inspectorEl.dataset.railSignal = 'default'");
    expect(source).not.toContain('context-inspector-provider-chip');
    expect(source).not.toContain('context-inspector-surface-chip');
  });
});
