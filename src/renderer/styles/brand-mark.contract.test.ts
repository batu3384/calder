import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const markPath = new URL('../assets/brand/mark.svg', import.meta.url);

describe('brand mark asset', () => {
  it('ships a lavender geometric SVG mark', () => {
    expect(existsSync(markPath)).toBe(true);
    const svg = readFileSync(markPath, 'utf-8');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('#5e6ad2');
    expect(svg).not.toContain('maskot');
  });
});
