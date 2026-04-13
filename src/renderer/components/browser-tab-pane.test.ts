import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const navigationSource = readFileSync(new URL('./browser-tab/navigation.ts', import.meta.url), 'utf-8');

describe('browser tab pane contract', () => {
  it('groups the toolbar into nav, address, and tools regions', () => {
    expect(source).toContain('browser-toolbar-nav');
    expect(source).toContain('browser-toolbar-address');
    expect(source).toContain('browser-toolbar-presence');
    expect(source).toContain('browser-toolbar-tools');
    expect(source).toContain('browser-toolbar-cluster');
    expect(source).toContain('browser-toolbar-cluster-label');
    expect(source).toContain('browser-pane-status');
    expect(source).not.toContain('browser-toolbar-route');
    expect(source).toContain("toolbarTools.setAttribute('aria-label', 'Live View tools')");
  });

  it('surfaces active capture mode and target session in the toolbar', () => {
    expect(source).toContain('browser-toolbar-presence');
    expect(source).toContain('browser-toolbar-presence-pill');
    expect(source).toContain("createBrowserPresenceBadge('Idle')");
    expect(source).toContain("createBrowserPresenceBadge('No target')");
    expect(source).toContain('instance.syncToolbarState = () => {');
    expect(source).toContain('modeBadge.dataset.state =');
    expect(source).toContain('targetBadge.dataset.state =');
    expect(source).toContain('modeBadgeText.textContent =');
    expect(source).toContain('targetBadgeText.textContent =');
  });

  it('lets toolbar badges jump into capture actions without hunting through the composer', () => {
    expect(source).toContain('modeBadge.addEventListener(\'click\'');
    expect(source).toContain('targetBadge.addEventListener(\'click\'');
    expect(source).toContain('focusActiveCaptureComposer(instance)');
    expect(source).toContain('openBrowserTargetMenu(instance, targetBadge');
  });

  it('treats toolbar badges like first-class controls with icons and menu semantics', () => {
    expect(source).toContain('browser-toolbar-presence-icon');
    expect(source).toContain('browser-toolbar-presence-text');
    expect(source).toContain("targetBadge.setAttribute('aria-haspopup', 'menu')");
    expect(source).toContain("targetBadge.setAttribute('aria-expanded', 'false')");
    expect(source).toContain("targetBadge.setAttribute('aria-expanded', 'true')");
    expect(source).toContain('modeBadge.title =');
    expect(source).toContain('targetBadge.title =');
  });

  it('tracks loading state in the chrome and toggles the primary button behavior', () => {
    expect(source).toContain('statusBadge.dataset.state = state');
    expect(source).toContain("goBtn.textContent = state === 'loading' ? 'Stop' : 'Go'");
    expect(source).toContain("if (instance.isLoading) {");
    expect(source).toContain('webview.addEventListener(\'did-start-loading\'');
    expect(source).toContain('webview.addEventListener(\'did-stop-loading\'');
  });

  it('keeps nav controls honest and makes the address field easier to recover', () => {
    expect(source).toContain('syncNavigationControls(instance)');
    expect(source).toContain('if (!instance.webviewReady) {');
    expect(source).toContain('backBtn.disabled = !instance.webview.canGoBack()');
    expect(source).toContain('fwdBtn.disabled = !instance.webview.canGoForward()');
    expect(source).toContain("webview.addEventListener('dom-ready'");
    expect(source).toContain('urlInput.addEventListener(\'focus\'');
    expect(source).toContain('urlInput.select()');
    expect(source).toContain("e.key === 'Escape'");
  });

  it('adapts go and reload actions to unapplied address changes', () => {
    expect(source).toContain('syncAddressBarState(instance)');
    expect(source).toContain("urlInput.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false'");
    expect(source).toContain("goBtn.dataset.state = 'reload'");
    expect(source).toContain("goBtn.dataset.state = 'open'");
    expect(source).toContain("goBtn.dataset.state = 'stop'");
    expect(source).toContain('function reloadCurrentPage(): void {');
    expect(source).toContain('if (!instance.webviewReady) return;');
    expect(source).toContain('reloadBtn.disabled = !instance.webviewReady || instance.isLoading || hasUnappliedAddressChange');
    expect(source).toContain('urlInput.addEventListener(\'input\'');
  });

  it('supports browser-like keyboard flow for address focus and reload', () => {
    expect(source).toContain("if ((e.input.meta || e.input.control) && e.input.key.toLowerCase() === 'l')");
    expect(source).toContain("if ((e.input.meta || e.input.control) && e.input.key.toLowerCase() === 'r')");
    expect(source).toContain('urlInput.focus()');
    expect(source).toContain('urlInput.select()');
    expect(source).toContain('webview.focus()');
    expect(source).toContain('webview.reload()');
    expect(source).toContain('webview.stop()');
  });

  it('isolates browser guests into a dedicated live-view partition', () => {
    expect(source).toContain("import { BROWSER_SESSION_PARTITION } from '../../../shared/constants.js';");
    expect(source).toContain("webview.setAttribute('partition', BROWSER_SESSION_PARTITION);");
    expect(source).not.toContain("webview.setAttribute('allowpopups', '');");
  });

  it('routes popup requests through the host instead of enabling webview popups', () => {
    expect(source).toContain("import { handleBrowserGuestOpenRequest } from './popup-routing.js';");
    expect(source).toContain("e.channel === 'browser-open-request'");
    expect(source).toContain('handleBrowserGuestOpenRequest(');
  });

  it('renders the Calder new tab composition', () => {
    expect(source).toContain('browser-ntp-eyebrow');
    expect(source).toContain('browser-ntp-title');
    expect(source).toContain('browser-ntp-actions');
    expect(source).toContain('browser-ntp-grid');
    expect(source).toContain('browser-ntp-section-header');
    expect(source).toContain('browser-ntp-section-meta');
    expect(source).toContain("chromeLabel.textContent = 'Live View'");
    expect(source).toContain("chromeHint.textContent = 'Capture context'");
    expect(source).toContain("ntpEyebrow.textContent = 'Live View'");
    expect(source).toContain("ntpTitle.textContent = 'Open a running surface'");
    expect(source).toContain("ntpTargetsMeta.textContent = 'Scanning…'");
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
    expect(source).toContain("syncSurfaceVisibility(!url || url === 'about:blank');");
    expect(source).toContain("webview.dataset.surface = showEmptySurface ? 'hidden' : 'live'");
    expect(source).toContain('webview.hidden = showEmptySurface');
    expect(source).toContain('contentShell.appendChild(newTabPage);');
    expect(source).not.toContain('viewportContainer.appendChild(newTabPage);');
    expect(source).toContain("if (e.url === 'about:blank')");
    expect(navigationSource).toContain("instance.newTabPage.dataset.mode = normalizedUrl === 'about:blank' ? 'default' : 'hidden'");
    expect(navigationSource).toContain("instance.syncSurfaceVisibility(normalizedUrl === 'about:blank');");
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
    expect(source).toContain('browser-capture-panel');
    expect(source).toContain('browser-capture-header');
    expect(source).toContain('browser-capture-kicker');
    expect(source).toContain('browser-capture-title');
    expect(source).toContain('browser-inspect-panel-handle');
    expect(source).toContain('enablePopoverDragging(instance, inspectPanel, inspectHandle)');
    expect(source).toContain("inspectPanel.classList.add('calder-popover')");
    expect(source).toContain("drawPanel.classList.add('calder-popover')");
  });

  it('tags the browser pane with its session id for layout routing', () => {
    expect(source).toContain('el.dataset.sessionId = sessionId');
  });
});
