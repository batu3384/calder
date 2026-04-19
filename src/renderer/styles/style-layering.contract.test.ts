import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');
const browserCss = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');

function countTopLevelSelector(source: string, selector: string): number {
  const pattern = new RegExp(`^${selector}\\s*\\{`, 'gm');
  return (source.match(pattern) ?? []).length;
}

describe('style layering contract', () => {
  it('keeps critical top-level selectors single-owned in component styles', () => {
    expect(countTopLevelSelector(tabsCss, '#tab-bar')).toBe(1);
    expect(countTopLevelSelector(inspectorCss, '#context-inspector')).toBe(1);
    expect(countTopLevelSelector(browserCss, '\\.browser-tab-toolbar')).toBe(1);
  });

  it('removes local polish override blocks that caused rule collisions', () => {
    expect(tabsCss).not.toContain('Premium polish overrides');
    expect(tabsCss).not.toContain('Micro polish pass');
    expect(inspectorCss).not.toContain('Rail refinement');
  });
});
