import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const sidebarSource = readFileSync(new URL('./sidebar.ts', import.meta.url), 'utf-8');
const sidebarCss = readFileSync(new URL('../styles/sidebar.css', import.meta.url), 'utf-8');

function readTsSidebarMax(source: string): number {
  const match = source.match(/const SIDEBAR_MAX = (\d+);/);
  if (!match) throw new Error('Could not find SIDEBAR_MAX in sidebar.ts');
  return Number(match[1]);
}

function readCssSidebarMax(source: string): number | null {
  const blockMatch = source.match(/#sidebar\s*\{[\s\S]*?\}/);
  if (!blockMatch) return null;
  const maxMatch = blockMatch[0].match(/max-width:\s*(\d+)px;/);
  if (!maxMatch) return null;
  return Number(maxMatch[1]);
}

describe('sidebar resize contract', () => {
  it('does not clamp CSS narrower than runtime drag max', () => {
    const tsMax = readTsSidebarMax(sidebarSource);
    const cssMax = readCssSidebarMax(sidebarCss);
    expect(cssMax === null || cssMax >= tsMax).toBe(true);
  });
});
