import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/browser-tab.css', import.meta.url), 'utf-8');

describe('browser stage contract', () => {
  it('adds a browser chrome header above the workspace toolbar', () => {
    expect(source).toContain('browser-pane-chrome');
    expect(source).toContain('browser-pane-label');
    expect(source).toContain('browser-pane-status');
    expect(source).not.toContain('browser-pane-workspace');
    expect(source).toContain("chromeLabel.textContent = 'Live View'");
    expect(source).toContain("chromeHint.textContent = 'Capture context'");
    expect(source).toContain("statusBadge.textContent = 'Ready'");
    expect(source).toContain("toolbarTools.setAttribute('aria-label', 'Live View tools')");
  });

  it('styles the browser chrome header and elevated toolbar', () => {
    expect(css).toContain('.browser-pane-chrome');
    expect(css).toContain('.browser-pane-label');
    expect(css).toContain('.browser-pane-status');
    expect(css).toContain('background: transparent;');
    expect(css).toContain('border: none;');
    expect(css).not.toContain('.browser-pane-workspace');
    expect(css).toContain('.browser-tab-toolbar');
    expect(css).toContain('padding: 8px 12px 9px;');
    expect(css).toContain('border-radius: 999px;');
    expect(css).toContain('.browser-url-input');
    expect(css).toContain('border-left: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent);');
    expect(css).toContain('.browser-go-btn');
    expect(css).toContain('min-width: 40px;');
    expect(css).toContain('.browser-go-btn.loading');
    expect(css).toContain('.browser-pane-status[data-state=\'loading\']');
  });

  it('wraps nav and address controls in quieter toolbar shells', () => {
    expect(source).toContain('browser-toolbar-nav-shell');
    expect(source).toContain('browser-toolbar-address-shell');
    expect(css).toContain('.browser-toolbar-nav-shell');
    expect(css).toContain('.browser-toolbar-address-shell');
    expect(css).toContain('border: 1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent);');
    expect(css).toContain('color-mix(in srgb, var(--surface-panel) 58%, transparent);');
  });

  it('keeps view/capture controls grouped in a single tools shell', () => {
    expect(source).not.toContain('browser-toolbar-presence-shell');
    expect(source).toContain('browser-toolbar-tools-shell');
    expect(css).toContain('.browser-toolbar-tools-shell');
    expect(css).toContain('padding: 2px 4px;');
    expect(css).toContain('.browser-toolbar-cluster:first-child');
    expect(css).toContain('flex-wrap: nowrap;');
    expect(css).toContain('gap: 6px;');
  });

  it('adds subtle motion to toolbar shells instead of leaving them static', () => {
    expect(css).toContain('transition:');
    expect(css).toContain('box-shadow 180ms ease');
    expect(css).toContain('transform 180ms ease');
    expect(css).toContain('.browser-toolbar-nav-shell:hover');
    expect(css).toContain('.browser-toolbar-tools-shell:hover');
  });

  it('gives capture composer panels stronger spacing and type hierarchy', () => {
    expect(css).toContain('.browser-capture-panel,');
    expect(css).toContain('.browser-inspect-panel {');
    expect(css).toContain('gap: 12px;');
    expect(css).toContain('padding: 14px;');
    expect(css).toContain('.browser-capture-copy');
    expect(css).toContain('gap: 5px;');
    expect(css).toContain('.browser-capture-title');
    expect(css).toContain('font-size: 15px;');
    expect(css).toContain('.browser-capture-chip');
    expect(css).toContain('min-height: 24px;');
  });

  it('treats the new-tab and offline surface like a real hero state', () => {
    expect(source).toContain('browser-ntp-hero');
    expect(source).toContain('browser-ntp-state');
    expect(source).toContain('browser-content-shell');
    expect(source).toContain("ntpState.textContent = 'Ready to capture'");
    expect(source).toContain("ntpState.textContent = 'Offline'");
    expect(css).toContain('.browser-ntp-hero');
    expect(css).toContain('.browser-ntp-state');
    expect(css).toContain('position: relative;');
    expect(css).toContain(".browser-webview[data-surface='hidden']");
    expect(css).toContain('display: none;');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) auto;');
  });

  it('keeps the split browser toolbar compact instead of wasting horizontal room', () => {
    expect(css).toContain('.browser-tab-pane.split .browser-toolbar-address');
    expect(css).toContain('min-width: min(220px, 100%);');
    expect(css).toContain('.browser-tab-pane.split .browser-toolbar-tools');
    expect(css).toContain('padding-left: 0;');
  });

  it('keeps the viewport picker dropdown above live content layers', () => {
    expect(css).toContain('.browser-viewport-dropdown');
    expect(css).toContain('z-index: 120;');
  });

  it('tightens the toolbar before the right rail forces an early wrap', () => {
    expect(css).toContain('@container workspace-stack (max-width: 1020px)');
    expect(css).toContain('.browser-toolbar-primary');
    expect(css).toContain('min-width: min(340px, 100%);');
    expect(css).toContain('.browser-toolbar-address');
    expect(css).toContain('flex: 1 1 260px;');
    expect(css).toContain('.browser-toolbar-cluster-controls');
    expect(css).toContain('gap: 4px;');
  });

  it('compresses the new-tab hero when the browser stage is split and narrow', () => {
    expect(css).toContain('.browser-tab-pane.split .browser-new-tab-page');
    expect(css).toContain('.browser-tab-pane.split .browser-ntp-hero');
    expect(css).toContain('.browser-tab-pane.split .browser-ntp-title');
    expect(css).toContain('.browser-tab-pane.split .browser-ntp-layout');
    expect(css).toContain('padding: 18px 18px 20px;');
    expect(css).toContain('font-size: 24px;');
    expect(css).toContain('grid-template-columns: 1fr;');
  });
});
