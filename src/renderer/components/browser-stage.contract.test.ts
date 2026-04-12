import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/browser-tab.css', import.meta.url), 'utf-8');

describe('browser stage contract', () => {
  it('adds a browser chrome header above the workspace toolbar', () => {
    expect(source).toContain('browser-pane-chrome');
    expect(source).toContain('browser-pane-label');
    expect(source).toContain('browser-pane-workspace');
    expect(source).toContain("chromeLabel.textContent = 'Live View'");
    expect(source).toContain("chromeHint.textContent = 'Inspect, annotate, hand off'");
    expect(source).toContain("toolbarTools.setAttribute('aria-label', 'Live View tools')");
  });

  it('styles the browser chrome header and elevated toolbar', () => {
    expect(css).toContain('.browser-pane-chrome');
    expect(css).toContain('.browser-pane-label');
    expect(css).toContain('background: transparent;');
    expect(css).toContain('border: none;');
    expect(css).toContain('.browser-pane-workspace');
    expect(css).toContain('.browser-tab-toolbar');
    expect(css).toContain('padding: 9px 12px 9px;');
    expect(css).toContain('border-radius: 10px;');
    expect(css).toContain('.browser-url-input');
    expect(css).toContain('border-radius: 10px;');
    expect(css).toContain('.browser-go-btn');
    expect(css).toContain('min-width: 40px;');
  });

  it('keeps the split browser toolbar compact instead of wasting horizontal room', () => {
    expect(css).toContain('.browser-tab-pane.split .browser-toolbar-address');
    expect(css).toContain('min-width: min(220px, 100%);');
    expect(css).toContain('.browser-tab-pane.split .browser-toolbar-tools');
    expect(css).toContain('padding-left: 0;');
  });
});
