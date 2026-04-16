import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./git-status.ts', import.meta.url), 'utf-8');

describe('git status polling contract', () => {
  it('guards polling initialization so listeners are attached once', () => {
    expect(source).toContain('let initialized = false;');
    expect(source).toContain('if (initialized) return;');
    expect(source).toContain('initialized = true;');
  });
});
