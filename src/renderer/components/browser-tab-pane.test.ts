import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const navigationSource = readFileSync(new URL('./browser-tab/navigation.ts', import.meta.url), 'utf-8');
const viewportSource = readFileSync(new URL('./browser-tab/viewport.ts', import.meta.url), 'utf-8');

describe('browser tab pane contract', () => {
  it('groups the toolbar into nav, address, and tools regions', () => {
    expect(source).toContain('browser-toolbar-nav');
    expect(source).toContain('browser-toolbar-address');
    expect(source).toContain('browser-toolbar-tools');
    expect(source).toContain('browser-toolbar-cluster');
    expect(source).toContain('browser-toolbar-cluster-label');
    expect(source).toContain('browser-pane-status');
    expect(source).not.toContain('browser-toolbar-route');
    expect(source).toContain("toolbarTools.setAttribute('aria-label', 'Live View tools')");
  });

  it('surfaces active capture mode inside the capture cluster label', () => {
    expect(source).toContain("createBrowserToolbarCluster('Capture')");
    expect(source).toContain('instance.syncToolbarState = () => {');
    expect(source).toContain("captureCluster.label.textContent = 'Capture';");
    expect(source).toContain('captureCluster.element.dataset.captureMode = mode;');
    expect(source).toContain('captureCluster.label.title = selectedTarget');
    expect(source).toContain("inspectBtn.textContent = instance.inspectMode ? 'Inspecting' : 'Inspect';");
    expect(source).toContain("drawBtn.textContent = instance.drawMode ? 'Drawing' : 'Draw';");
    expect(source).toContain("recordBtn.textContent = instance.flowMode ? 'Recording' : 'Record';");
  });

  it('keeps target session selection inside capture composer controls', () => {
    expect(source).toContain('drawCustomBtn.addEventListener(\'click\'');
    expect(source).toContain('flowCustomBtn.addEventListener(\'click\'');
    expect(source).toContain('customBtn.addEventListener(\'click\'');
    expect(source).toContain("openBrowserTargetMenu(instance, drawCustomBtn, 'draw')");
    expect(source).toContain("openBrowserTargetMenu(instance, flowCustomBtn, 'flow')");
    expect(source).toContain("openBrowserTargetMenu(instance, customBtn, 'inspect')");
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
    expect(source).toContain('sendGuestMessage(instance.webview, \'enter-inspect-mode\')');
    expect(source).toContain('sendGuestMessage(instance.webview, \'enter-flow-mode\')');
    expect(source).toContain('sendGuestMessage(instance.webview, \'enter-draw-mode\')');
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

  it('adds a compact home button beside reload to reopen the localhost start surface', () => {
    expect(source).toContain("homeBtn.className = 'browser-nav-btn browser-home-btn'");
    expect(source).toContain("homeBtn.title = 'Home'");
    expect(source).toContain('toolbarNavShell.appendChild(homeBtn);');
    expect(source).toContain('function openBrowserHome(): void {');
    expect(source).toContain("navigateTo(instance, 'about:blank');");
    expect(source).toContain('void populateLocalTargets(instance, ntpGrid, ntpTargetsText, ntpTargetsMeta);');
    expect(source).toContain("homeBtn.addEventListener('click', () => openBrowserHome());");
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

  it('loads the guest preload script before assigning the browser surface src', () => {
    expect(source).toContain("import { getPreloadPath, instances } from './instance.js';");
    expect(source).toContain('void getPreloadPath()');
    expect(source).toContain("webview.setAttribute('preload', `file://${preloadPath}`);");
    expect(source).toContain('viewportContainer.appendChild(webview);');
  });

  it('does not overwrite a newer navigation with a stale initial src assignment', () => {
    expect(source).toContain("webview.src = instance.committedUrl || url || 'about:blank';");
  });

  it('re-synchronizes a browser pane with the latest stored url when it is reattached and shown', () => {
    expect(source).toContain('function syncBrowserTabToSessionState(instance: BrowserTabInstance): void {');
    expect(source).toContain('attachBrowserTabToContainer(sessionId: string, container: HTMLElement): void');
    expect(source).toContain('syncBrowserTabToSessionState(instance);');
    expect(source).toContain('requestAnimationFrame(() => syncBrowserTabToSessionState(instance));');
  });

  it('ignores benign aborted loads instead of forcing offline fallback', () => {
    expect(source).toContain("if (e.errorCode === -3 || normalizedError.includes('ERR_ABORTED')) return;");
  });

  it('ignores stale navigation events that try to revert to the previous url', () => {
    expect(source).toContain('function isStaleNavigationRevert(instance: BrowserTabInstance, nextUrl: string): boolean {');
    expect(source).toContain('function canonicalizeNavigationUrl(value: string | undefined): string {');
    expect(source).toContain('if (isStaleNavigationRevert(instance, e.url)) return;');
    expect(source).toContain('if (isStaleNavigationRevert(instance, failedUrl)) return;');
  });

  it('anchors the viewport picker with floating placement and cleans it up', () => {
    expect(viewportSource).toContain("import { anchorFloatingSurface } from '../floating-surface.js';");
    expect(viewportSource).toContain('anchorFloatingSurface(');
    expect(viewportSource).toContain('instance.viewportBtn,');
    expect(viewportSource).toContain('instance.viewportDropdown,');
    expect(viewportSource).toContain("placement: 'bottom-end'");
    expect(viewportSource).toContain('instance.viewportDropdownFloatingCleanup?.();');
    expect(source).toContain('viewportDropdownFloatingCleanup: null');
    expect(source).toContain('instance.viewportDropdownFloatingCleanup?.();');
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
    expect(source).toContain('appState.passivateBrowserTabSession(sessionId, failedUrl);');
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
    expect(source).toContain("import { sendGuestMessage } from './guest-messaging.js';");
    expect(source).toContain('targetMenuFloatingCleanup');
    expect(source).toContain('anchorFloatingSurface(trigger, instance.targetMenu');
    expect(source).toContain('Open Sessions');
    expect(source).toContain('Select Session');
    expect(source).toContain('Send to selected');
    expect(source).not.toContain('browser-target-rail');
    expect(source).not.toContain('Send to Session');
    expect(source).not.toContain('instance.targetBadge.contains(target)');
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
