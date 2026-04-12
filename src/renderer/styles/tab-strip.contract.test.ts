import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');

describe('tab strip polish contract', () => {
  it('treats the tab list as a framed strip and unifies session badge styling', () => {
    expect(tabsCss).toContain('height: 54px;');
    expect(tabsCss).toContain('#tab-list');
    expect(tabsCss).toContain('background: color-mix(in srgb, var(--surface-panel) 74%, transparent);');
    expect(tabsCss).toContain('.tab-item {');
    expect(tabsCss).toContain('background: transparent;');
    expect(tabsCss).toContain('.tab-diff-badge,');
    expect(tabsCss).toContain('.tab-browser-badge');
    expect(tabsCss).toContain('.tab-item.active .tab-name');
  });
});
