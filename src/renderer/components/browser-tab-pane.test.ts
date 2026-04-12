import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');

describe('browser tab pane contract', () => {
  it('groups the toolbar into nav, address, and tools regions', () => {
    expect(source).toContain('browser-toolbar-nav');
    expect(source).toContain('browser-toolbar-address');
    expect(source).toContain('browser-toolbar-tools');
    expect(source).toContain("toolbarTools.setAttribute('aria-label', 'Live View tools')");
  });

  it('renders the Calder new tab composition', () => {
    expect(source).toContain('browser-ntp-eyebrow');
    expect(source).toContain('browser-ntp-title');
    expect(source).toContain('browser-ntp-grid');
    expect(source).toContain("chromeLabel.textContent = 'Live View'");
    expect(source).toContain("chromeHint.textContent = 'Inspect, capture, annotate'");
    expect(source).toContain("ntpEyebrow.textContent = 'Live View'");
    expect(source).toContain("ntpTitle.textContent = 'Open a live target'");
    expect(source).not.toContain("chromeLabel.textContent = 'Browser surface'");
    expect(source).not.toContain("ntpEyebrow.textContent = 'Calder Workspace'");
  });

  it('discovers active localhost targets instead of shipping hardcoded common ports', () => {
    expect(source).toContain('window.calder.browser.listLocalTargets');
    expect(source).not.toContain("localhost:3000', meta: 'Primary app'");
    expect(source).not.toContain("localhost:5173', meta: 'Vite dev server'");
  });

  it('renders a compact session picker beside browser send actions', () => {
    expect(source).toContain('browser-target-trigger');
    expect(source).toContain('browser-target-menu');
    expect(source).toContain("import { anchorFloatingSurface } from '../floating-surface.js';");
    expect(source).toContain('targetMenuFloatingCleanup');
    expect(source).toContain('anchorFloatingSurface(trigger, instance.targetMenu');
    expect(source).toContain('Open Sessions');
    expect(source).toContain('Select Session');
    expect(source).toContain('Send to selected');
    expect(source).not.toContain('browser-target-rail');
    expect(source).not.toContain('Send to Session');
  });

  it('adds a drag handle to the inspect panel instead of locking it in place', () => {
    expect(source).toContain('browser-inspect-panel-handle');
    expect(source).toContain('enablePopoverDragging(instance, inspectPanel, inspectHandle)');
    expect(source).toContain("inspectPanel.classList.add('calder-popover')");
    expect(source).toContain("drawPanel.classList.add('calder-popover')");
  });

  it('tags the browser pane with its session id for layout routing', () => {
    expect(source).toContain('el.dataset.sessionId = sessionId');
  });
});
