import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');

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
});
