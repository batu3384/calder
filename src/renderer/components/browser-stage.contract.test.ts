import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/browser-tab.css', import.meta.url), 'utf-8');

describe('browser stage contract', () => {
  it('adds a browser chrome header above the workspace toolbar', () => {
    expect(source).toContain('browser-pane-chrome');
    expect(source).toContain('browser-pane-label');
    expect(source).toContain('browser-pane-workspace');
    expect(source).toContain('Browser surface');
  });

  it('styles the browser chrome header and elevated toolbar', () => {
    expect(css).toContain('.browser-pane-chrome');
    expect(css).toContain('.browser-pane-label');
    expect(css).toContain('.browser-pane-workspace');
    expect(css).toContain('.browser-tab-toolbar');
  });
});
