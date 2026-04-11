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

  it('keeps the split browser toolbar compact instead of wasting horizontal room', () => {
    expect(css).toContain('.browser-tab-pane.split .browser-toolbar-address');
    expect(css).toContain('min-width: min(220px, 100%);');
    expect(css).toContain('.browser-tab-pane.split .browser-toolbar-tools');
    expect(css).toContain('padding-left: 0;');
  });
});
