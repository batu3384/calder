import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/preload/browser-tab-preload.ts'), 'utf-8');

describe('browser tab preload inspect contract', () => {
  it('guards inspect and flow handlers against non-element event targets', () => {
    expect(source).toContain('if (!(target instanceof Element)) return;');
    expect(source).toContain('const target = e.target;');
    expect(source).not.toContain('browser-tab-open-intent');
    expect(source).not.toContain('browser-tab-popup');
  });
});
