import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const navigationSource = readFileSync(new URL('./browser-tab/navigation.ts', import.meta.url), 'utf-8');

describe('browser tab pane contract', () => {
  it('groups the toolbar into nav, address, and tools regions', () => {
    expect(source).toContain('browser-toolbar-nav');
    expect(source).toContain('browser-toolbar-address');
    expect(source).toContain('browser-toolbar-tools');
    expect(source).toContain('browser-toolbar-cluster');
    expect(source).toContain('browser-toolbar-cluster-label');
    expect(source).toContain('browser-toolbar-route');
    expect(source).toContain("toolbarTools.setAttribute('aria-label', 'Live View tools')");
  });

  it('renders the Calder new tab composition', () => {
    expect(source).toContain('browser-ntp-eyebrow');
    expect(source).toContain('browser-ntp-title');
    expect(source).toContain('browser-ntp-actions');
    expect(source).toContain('browser-ntp-grid');
    expect(source).toContain("chromeLabel.textContent = 'Live View'");
    expect(source).toContain("chromeHint.textContent = 'Inspect, annotate, hand off'");
    expect(source).toContain("ntpEyebrow.textContent = 'Live View'");
    expect(source).toContain("ntpTitle.textContent = 'Open a local surface'");
    expect(source).toContain("focusAddressBtn.textContent = 'Focus address bar'");
    expect(source).toContain("refreshTargetsBtn.textContent = 'Rescan localhost'");
    expect(source).not.toContain("chromeLabel.textContent = 'Browser surface'");
    expect(source).not.toContain("ntpEyebrow.textContent = 'Calder Workspace'");
  });

  it('discovers active localhost targets instead of shipping hardcoded common ports', () => {
    expect(source).toContain('window.calder.browser.listLocalTargets');
    expect(source).not.toContain("localhost:3000', meta: 'Primary app'");
    expect(source).not.toContain("localhost:5173', meta: 'Vite dev server'");
  });

  it('renders localhost target labels as text nodes instead of HTML interpolation', () => {
    expect(source).toContain('label.textContent = target.label');
    expect(source).toContain('meta.textContent = target.meta');
    expect(source).not.toContain('<span class="browser-ntp-link-label">${target.label}</span>');
    expect(source).not.toContain('<span class="browser-ntp-link-meta">${target.meta}</span>');
  });

  it('falls back to a helpful offline state when a remembered localhost target is unavailable', () => {
    expect(source).toContain('did-fail-load');
    expect(source).toContain('Surface offline');
    expect(source).toContain('Start the local app again');
    expect(source).toContain('webview.stop()');
  });

  it('treats about:blank as an empty surface instead of a white content area', () => {
    expect(source).toContain("newTabPage.dataset.mode = url === 'about:blank' ? 'default' : 'hidden'");
    expect(source).toContain("newTabPage.style.display = !url || url === 'about:blank' ? 'flex' : 'none'");
    expect(source).toContain("if (e.url === 'about:blank')");
    expect(navigationSource).toContain("instance.newTabPage.dataset.mode = normalizedUrl === 'about:blank' ? 'default' : 'hidden'");
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
