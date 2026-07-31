import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sheetPath = path.join(process.cwd(), 'src/renderer/assets/pixel-agent/studio-sheet.svg');

describe('pixel studio sprite sheet', () => {
  it('ships an 8-tile SVG sprite sheet for stations and agent frames', () => {
    expect(existsSync(sheetPath)).toBe(true);
    const svg = readFileSync(sheetPath, 'utf8');
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="16"');
    expect(svg).toContain('translate(96,0)');
    expect(svg).toContain('translate(112,0)');
  });
});
