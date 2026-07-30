import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const markPath = new URL('../assets/brand/mark.svg', import.meta.url);

describe('brand mark asset', () => {
  it('ships a steel-blue Calder C mark', () => {
    expect(existsSync(markPath)).toBe(true);
    const svg = readFileSync(markPath, 'utf-8');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('#6f9aa6');
    expect(svg).toContain('x="7" y="6" width="17" height="6"');
    expect(svg).toContain('x="6" y="6" width="6" height="20"');
    expect(svg).toContain('x="7" y="20" width="17" height="6"');
    expect(svg).not.toContain('x="20" y="6" width="6" height="20"');
    expect(svg).not.toContain('maskot');
  });
});
