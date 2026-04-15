import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const browserCss = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');
const preferencesCss = readFileSync(new URL('./preferences.css', import.meta.url), 'utf-8');

describe('tab bar responsive command deck contract', () => {
  it('keeps the live view and cli surface controls inline until a narrower shell width', () => {
    expect(tabsCss).toContain('@container workspace-stack (max-width: 980px)');
    expect(tabsCss).toContain('.surface-mode-button');
    expect(tabsCss).toContain('padding: 0 8px;');
    expect(tabsCss).toContain('#git-status {');
    expect(tabsCss).toContain('padding: 0 8px;');
    expect(tabsCss).toContain('#git-status .git-ahead-behind');
    expect(tabsCss).toContain('display: none;');
    expect(tabsCss).toContain('max-width: 110px;');
    expect(tabsCss).toContain('@container workspace-stack (max-width: 820px)');
    expect(tabsCss).toContain('"main"');
    expect(tabsCss).toContain('"meta"');
    expect(tabsCss).toContain('"actions"');
  });

  it('keeps shell controls readable on constrained width and height', () => {
    expect(tabsCss).toContain('@container workspace-stack (max-width: 1180px)');
    expect(browserCss).toContain('@container workspace-stack (max-width: 1180px)');
    expect(preferencesCss).toContain('@media (max-height: 860px)');
  });
});
