import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');

describe('tab strip polish contract', () => {
  it('treats the tab list as a lighter strip and unifies session badge styling', () => {
    expect(tabsCss).toContain('height: 56px;');
    expect(tabsCss).toContain('min-height: 56px;');
    expect(tabsCss).toContain('#tab-list');
    expect(tabsCss).toContain('background: transparent;');
    expect(tabsCss).toContain('.tab-item {');
    expect(tabsCss).toContain('.tab-name-label');
    expect(tabsCss).toContain('.tab-diff-badge,');
    expect(tabsCss).toContain('.tab-browser-badge');
    expect(tabsCss).toContain('.tab-item.active .tab-name');
  });

  it('gives active and hover tabs a calmer elevated feel instead of a flat strip', () => {
    expect(tabsCss).toContain('.tab-item:hover');
    expect(tabsCss).toContain('transform: translateY(-1px);');
    expect(tabsCss).toContain('.tab-item.active {');
    expect(tabsCss).toContain('var(--shadow-lift);');
  });
});
