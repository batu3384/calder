import { appState } from '../../state.js';
import { shortcutManager } from '../../shortcuts.js';
import { getProviderDisplayName } from '../../provider-availability.js';
import {
  VIEWPORT_PRESETS,
  type BrowserTabInstance,
  type ElementInfo,
  type FlowPickerAction,
  type FlowPickerMetadata,
  type FlowReplayPayload,
  type WebviewElement,
} from './types.js';
import { getPreloadPath, instances } from './instance.js';
import { navigateTo, normalizeUrl } from './navigation.js';
import { enablePopoverDragging } from './popover.js';
import { applyViewport, openViewportDropdown, closeViewportDropdown } from './viewport.js';
import { toggleInspectMode, showElementInfo, dismissInspect } from './inspect-mode.js';
import {
  toggleDrawMode,
  clearDrawing,
  dismissDraw,
  sendDrawToSelectedSession,
  sendDrawToNewSession,
  sendDrawToCustomSession,
  positionDrawPopover,
} from './draw-mode.js';
import { addFlowStep, clearFlow, toggleFlowMode } from './flow-recording.js';
import { showFlowPicker, dismissFlowPicker } from './flow-picker.js';
import { sendGuestMessage } from './guest-messaging.js';
import { buildBrowserSessionPartition } from '../../../shared/constants.js';
import type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
  BrowserGuestOpenPayload,
  ProviderId,
} from '../../../shared/types.js';
import {
  sendFlowToCustomSession,
  sendFlowToSelectedSession,
  sendFlowToNewSession,
  sendToCustomSession,
  sendToSelectedSession,
  sendToNewSession,
} from './session-integration.js';
import { anchorFloatingSurface } from '../floating-surface.js';
import { logDebugEvent } from '../debug-panel.js';
import { handleBrowserGuestOpenRequest } from './popup-routing.js';

function createBrowserToolbarCluster(labelText: string): {
  element: HTMLDivElement;
  label: HTMLSpanElement;
  controls: HTMLDivElement;
} {
  const element = document.createElement('div');
  element.className = 'browser-toolbar-cluster';

  const label = document.createElement('span');
  label.className = 'browser-toolbar-cluster-label';
  label.textContent = labelText;
  element.appendChild(label);

  const controls = document.createElement('div');
  controls.className = 'browser-toolbar-cluster-controls';
  element.appendChild(controls);

  return { element, label, controls };
}

type BrowserPageState = 'ready' | 'loading' | 'local' | 'remote' | 'offline';
const STALE_NAVIGATION_REVERT_WINDOW_MS = 1800;

function canonicalizeNavigationUrl(value: string | undefined): string {
  const url = (value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    return parsed.href;
  } catch {
    return url;
  }
}

function isLocalBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(parsed.hostname.toLowerCase());
  } catch {
    return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([/:]|$)/i.test(url);
  }
}

function resolveBrowserPageState(url: string, isLoading: boolean, offline: boolean): BrowserPageState {
  if (offline) return 'offline';
  if (isLoading) return 'loading';

  try {
    const parsed = new URL(url);
    if (isLocalBrowserUrl(url)) {
      return 'local';
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return 'remote';
    }
  } catch {}

  return 'ready';
}

function describeBrowserPageState(state: BrowserPageState): string {
  switch (state) {
    case 'loading':
      return 'Loading';
    case 'local':
      return 'Local';
    case 'remote':
      return 'Remote';
    case 'offline':
      return 'Offline';
    default:
      return 'Ready';
  }
}

function resolveBrowserPartitionForSession(sessionId: string): string {
  const owningProject = appState.projects.find((project) =>
    project.sessions.some((session) => session.id === sessionId),
  );
  return buildBrowserSessionPartition(owningProject?.id);
}

function resolveCredentialOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function browserTargetButtonLabel(instance: BrowserTabInstance): string {
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  const label = selectedTarget?.name ?? 'Select Session';
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

function setProviderAccentTarget(element: HTMLElement, providerId?: ProviderId): void {
  if (providerId) {
    element.dataset.provider = providerId;
    return;
  }
  delete element.dataset.provider;
}

function resolveCaptureModeState(instance: BrowserTabInstance): 'inspect' | 'draw' | 'flow' | 'idle' {
  if (instance.inspectMode) return 'inspect';
  if (instance.drawMode) return 'draw';
  if (instance.flowMode || instance.flowSteps.length > 0) return 'flow';
  return 'idle';
}

function isStaleNavigationRevert(instance: BrowserTabInstance, nextUrl: string): boolean {
  const pendingUrl = canonicalizeNavigationUrl(instance.pendingNavigationUrl);
  if (!pendingUrl) return false;
  const pendingAt = instance.pendingNavigationAt;
  if (!pendingAt || Date.now() - pendingAt > STALE_NAVIGATION_REVERT_WINDOW_MS) {
    clearPendingNavigation(instance);
    return false;
  }

  const candidateUrl = canonicalizeNavigationUrl(nextUrl);
  if (!candidateUrl) return false;
  if (candidateUrl === pendingUrl) return false;

  const previousUrl = canonicalizeNavigationUrl(instance.pendingNavigationPreviousUrl);
  if (previousUrl && candidateUrl === previousUrl) {
    return true;
  }
  return false;
}

function clearPendingNavigation(instance: BrowserTabInstance): void {
  delete instance.pendingNavigationUrl;
  delete instance.pendingNavigationPreviousUrl;
  delete instance.pendingNavigationAt;
}

function syncBrowserTabToSessionState(instance: BrowserTabInstance): void {
  const project = appState.projects.find((entry) =>
    entry.sessions.some((session) => session.id === instance.sessionId),
  );
  const session = project?.sessions.find(
    (entry) => entry.id === instance.sessionId && entry.type === 'browser-tab',
  );
  if (!session) return;

  const nextUrl = normalizeUrl(session.browserTabUrl ?? 'about:blank');
  const currentUrl = normalizeUrl(instance.committedUrl || instance.webview.src || 'about:blank');
  if (isStaleNavigationRevert(instance, nextUrl)) {
    return;
  }

  if (currentUrl === nextUrl) {
    instance.committedUrl = nextUrl;
    instance.urlInput.value = nextUrl;
    instance.newTabPage.dataset.mode = nextUrl === 'about:blank' ? 'default' : 'hidden';
    instance.syncSurfaceVisibility(nextUrl === 'about:blank');
    instance.syncAddressBarState();
    clearPendingNavigation(instance);
    return;
  }

  navigateTo(instance, nextUrl);
}

function closeBrowserTargetMenu(instance: BrowserTabInstance, reason = 'programmatic'): void {
  const wasOpen = instance.targetMenu.style.display !== 'none';
  instance.targetMenuFloatingCleanup?.();
  instance.targetMenuFloatingCleanup = null;
  instance.targetMenu.style.display = 'none';
  instance.activeTargetTrigger = null;
  instance.activeTargetMode = null;
  if (wasOpen) {
    logDebugEvent('browserMenu', instance.sessionId, {
      menu: 'session-target',
      state: 'close',
      reason,
    });
  }
}

function runTargetMenuAction(instance: BrowserTabInstance, action: 'new' | 'custom'): void {
  const mode = instance.activeTargetMode;
  closeBrowserTargetMenu(instance, `menu-action:${action}`);
  if (!mode) return;

  if (mode === 'inspect') {
    if (action === 'new') sendToNewSession(instance);
    else sendToCustomSession(instance);
    return;
  }

  if (mode === 'draw') {
    if (action === 'new') {
      void sendDrawToNewSession(instance);
    } else {
      void sendDrawToCustomSession(instance);
    }
    return;
  }

  if (action === 'new') {
    sendFlowToNewSession(instance);
  } else {
    sendFlowToCustomSession(instance);
  }
}

function renderBrowserTargetMenu(instance: BrowserTabInstance): void {
  const targetSessions = appState.listBrowserTargetSessions(instance.sessionId);
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  instance.targetMenuList.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'browser-target-menu-header';
  header.textContent = 'Open Sessions';
  instance.targetMenuList.appendChild(header);

  if (targetSessions.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'browser-target-menu-empty';
    emptyState.textContent = 'Open a CLI session to route browser prompts here.';
    instance.targetMenuList.appendChild(emptyState);
  } else {
    for (const session of targetSessions) {
      const providerId = session.providerId ?? 'claude';
      const button = document.createElement('button');
      button.className = 'browser-target-menu-item';
      setProviderAccentTarget(button, providerId);
      if (selectedTarget?.id === session.id) {
        button.classList.add('active');
      }

      const label = document.createElement('span');
      label.className = 'browser-target-session-name';
      label.textContent = session.name;

      const meta = document.createElement('span');
      meta.className = 'browser-target-session-meta';
      setProviderAccentTarget(meta, providerId);
      const parts = [getProviderDisplayName(providerId)];
      if (appState.activeProject?.activeSessionId === session.id) {
        parts.unshift('Active');
      }
      meta.textContent = parts.join(' · ');

      button.appendChild(label);
      button.appendChild(meta);
      button.addEventListener('click', () => {
        appState.setBrowserTargetSession(instance.sessionId, session.id);
        closeBrowserTargetMenu(instance, 'select-target');
      });
      instance.targetMenuList.appendChild(button);
    }
  }

  const separator = document.createElement('div');
  separator.className = 'browser-target-menu-separator';
  instance.targetMenuList.appendChild(separator);

  const newSessionBtn = document.createElement('button');
  newSessionBtn.className = 'browser-target-menu-item browser-target-menu-action';
  newSessionBtn.textContent = 'Send to New Session';
  newSessionBtn.addEventListener('click', () => runTargetMenuAction(instance, 'new'));
  instance.targetMenuList.appendChild(newSessionBtn);

  const customSessionBtn = document.createElement('button');
  customSessionBtn.className = 'browser-target-menu-item browser-target-menu-action';
  customSessionBtn.textContent = 'Send to Custom Session…';
  customSessionBtn.addEventListener('click', () => runTargetMenuAction(instance, 'custom'));
  instance.targetMenuList.appendChild(customSessionBtn);
}

function syncBrowserTargetControls(instance: BrowserTabInstance): void {
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  const selectedProviderId: ProviderId | undefined = selectedTarget
    ? selectedTarget.providerId ?? 'claude'
    : undefined;
  const hasTarget = !!selectedTarget;
  const primaryButtons = [instance.submitBtn, instance.drawSubmitBtn, instance.flowSubmitBtn];
  for (const button of primaryButtons) {
    button.disabled = !hasTarget;
    setProviderAccentTarget(button, selectedProviderId);
    button.title = hasTarget
      ? `Send to ${selectedTarget.name}`
      : 'Select an open session target first';
  }

  const targetButtons = [instance.inspectTargetBtn, instance.drawTargetBtn, instance.flowTargetBtn];
  const label = `${browserTargetButtonLabel(instance)} ▾`;
  for (const button of targetButtons) {
    setProviderAccentTarget(button, selectedProviderId);
    button.textContent = label;
    button.title = selectedTarget
      ? `Current target: ${getProviderDisplayName(selectedTarget.providerId ?? 'claude')} / ${selectedTarget.name}`
      : 'Choose which open session receives the browser prompt';
  }

  if (instance.targetMenu.style.display !== 'none') {
    renderBrowserTargetMenu(instance);
  }

  instance.syncToolbarState();
}

function openBrowserTargetMenu(
  instance: BrowserTabInstance,
  trigger: HTMLButtonElement,
  mode: 'inspect' | 'draw' | 'flow',
): void {
  if (instance.activeTargetTrigger === trigger && instance.targetMenu.style.display !== 'none') {
    closeBrowserTargetMenu(instance, 'trigger-toggle');
    return;
  }

  instance.activeTargetTrigger = trigger;
  instance.activeTargetMode = mode;
  renderBrowserTargetMenu(instance);
  instance.targetMenu.style.display = 'flex';
  instance.targetMenuFloatingCleanup?.();
  instance.targetMenuFloatingCleanup = anchorFloatingSurface(trigger, instance.targetMenu, {
    placement: 'bottom-end',
    offsetPx: 6,
    maxWidthPx: 300,
    maxHeightPx: 360,
  });
  logDebugEvent('browserMenu', instance.sessionId, {
    menu: 'session-target',
    state: 'open',
    reason: `trigger:${mode}`,
  });
}

async function populateLocalTargets(
  instance: BrowserTabInstance,
  grid: HTMLDivElement,
  copy: HTMLDivElement,
  meta: HTMLDivElement,
): Promise<void> {
  grid.innerHTML = '';
  copy.textContent = 'Scanning for active localhost targets…';
  meta.textContent = 'Scanning…';

  try {
    const targets = await window.calder.browser.listLocalTargets();
    if (!instances.has(instance.sessionId)) return;

    if (targets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'browser-ntp-empty';
      empty.textContent = 'No active localhost surfaces found yet. Start a dev server, or paste any URL above.';
      grid.appendChild(empty);
      copy.textContent = 'Only running localhost surfaces are listed here.';
      meta.textContent = '0 running';
      return;
    }

    copy.textContent = 'Only running localhost surfaces appear here. Pick one or paste any URL above.';
    meta.textContent = `${targets.length} running`;
    for (const target of targets) {
      const btn = document.createElement('button');
      btn.className = 'browser-ntp-link';
      const label = document.createElement('span');
      label.className = 'browser-ntp-link-label';
      label.textContent = target.label;

      const meta = document.createElement('span');
      meta.className = 'browser-ntp-link-meta';
      meta.textContent = target.meta;

      btn.appendChild(label);
      btn.appendChild(meta);
      btn.addEventListener('click', () => navigateTo(instance, target.url));
      grid.appendChild(btn);
    }
  } catch {
    if (!instances.has(instance.sessionId)) return;
    const empty = document.createElement('div');
    empty.className = 'browser-ntp-empty';
    empty.textContent = 'Could not detect localhost surfaces right now. Paste any URL above to keep going.';
    grid.appendChild(empty);
    copy.textContent = 'Only running localhost surfaces are listed here.';
    meta.textContent = 'Unavailable';
  }
}

export function createBrowserTabPane(sessionId: string, url?: string): void {
  if (instances.has(sessionId)) return;

  const el = document.createElement('div');
  el.className = 'browser-tab-pane hidden';
  el.dataset.sessionId = sessionId;

  const chrome = document.createElement('div');
  chrome.className = 'browser-pane-chrome';

  const chromeLabel = document.createElement('div');
  chromeLabel.className = 'browser-pane-label';
  chromeLabel.textContent = 'Live View';

  const chromeHint = document.createElement('div');
  chromeHint.className = 'browser-pane-hint';
  chromeHint.textContent = 'Capture context';

  const chromeMeta = document.createElement('div');
  chromeMeta.className = 'browser-pane-meta';

  const statusBadge = document.createElement('span');
  statusBadge.className = 'browser-pane-status';
  statusBadge.textContent = 'Ready';

  chromeMeta.appendChild(statusBadge);
  chromeMeta.appendChild(chromeHint);

  chrome.appendChild(chromeLabel);
  chrome.appendChild(chromeMeta);
  el.appendChild(chrome);

  const toolbar = document.createElement('div');
  toolbar.className = 'browser-tab-toolbar';

  const toolbarNav = document.createElement('div');
  toolbarNav.className = 'browser-toolbar-nav';

  const toolbarAddress = document.createElement('div');
  toolbarAddress.className = 'browser-toolbar-address browser-toolbar-primary';

  const toolbarNavShell = document.createElement('div');
  toolbarNavShell.className = 'browser-toolbar-nav-shell';

  const toolbarAddressShell = document.createElement('div');
  toolbarAddressShell.className = 'browser-toolbar-address-shell';

  const toolbarTools = document.createElement('div');
  toolbarTools.className = 'browser-toolbar-tools';
  toolbarTools.setAttribute('aria-label', 'Live View tools');

  const toolbarToolsShell = document.createElement('div');
  toolbarToolsShell.className = 'browser-toolbar-tools-shell';

  const viewCluster = createBrowserToolbarCluster('View');
  viewCluster.element.dataset.kind = 'view';

  const captureCluster = createBrowserToolbarCluster('Capture');
  captureCluster.element.dataset.kind = 'capture';

  const backBtn = document.createElement('button');
  backBtn.className = 'browser-nav-btn';
  backBtn.textContent = '\u25C0';
  backBtn.title = 'Back';
  backBtn.ariaLabel = 'Go back';

  const fwdBtn = document.createElement('button');
  fwdBtn.className = 'browser-nav-btn';
  fwdBtn.textContent = '\u25B6';
  fwdBtn.title = 'Forward';
  fwdBtn.ariaLabel = 'Go forward';

  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'browser-nav-btn browser-reload-btn';
  reloadBtn.textContent = '\u21BB';
  reloadBtn.title = 'Reload';
  reloadBtn.ariaLabel = 'Reload page';

  const homeBtn = document.createElement('button');
  homeBtn.className = 'browser-nav-btn browser-home-btn';
  homeBtn.textContent = '\u2302';
  homeBtn.title = 'Home';
  homeBtn.ariaLabel = 'Open Live View home';

  const urlInput = document.createElement('input');
  urlInput.className = 'browser-url-input';
  urlInput.type = 'text';
  urlInput.placeholder = 'Enter URL (e.g. localhost:3000)';
  urlInput.value = url || '';
  urlInput.ariaLabel = 'Browser address';

  const goBtn = document.createElement('button');
  goBtn.className = 'browser-go-btn';
  goBtn.textContent = 'Go';
  goBtn.ariaLabel = 'Open address';

  // Viewport picker button + dropdown
  const viewportWrapper = document.createElement('div');
  viewportWrapper.className = 'browser-viewport-wrapper';

  const viewportBtn = document.createElement('button');
  viewportBtn.className = 'browser-viewport-btn';
  viewportBtn.textContent = 'Viewport';
  viewportBtn.title = 'Change viewport size';
  viewportBtn.ariaLabel = 'Change viewport size';

  const viewportDropdown = document.createElement('div');
  viewportDropdown.className = 'browser-viewport-dropdown';

  for (const preset of VIEWPORT_PRESETS) {
    const item = document.createElement('div');
    item.className = 'browser-viewport-item';
    item.textContent = preset.width !== null
      ? `${preset.label} — ${preset.width}×${preset.height}`
      : preset.label;
    item.addEventListener('click', () => {
      applyViewport(instance, preset);
      closeViewportDropdown(instance, 'preset-select');
    });
    viewportDropdown.appendChild(item);
  }

  const customItem = document.createElement('div');
  customItem.className = 'browser-viewport-item browser-viewport-item-custom';
  customItem.textContent = 'Custom\u2026';
  viewportDropdown.appendChild(customItem);

  const customForm = document.createElement('div');
  customForm.className = 'browser-viewport-custom';

  const customWInput = document.createElement('input');
  customWInput.type = 'number';
  customWInput.className = 'browser-viewport-custom-input';
  customWInput.placeholder = 'W';
  customWInput.min = '1';

  const customSep = document.createElement('span');
  customSep.className = 'browser-viewport-custom-sep';
  customSep.textContent = '\u00D7';

  const customHInput = document.createElement('input');
  customHInput.type = 'number';
  customHInput.className = 'browser-viewport-custom-input';
  customHInput.placeholder = 'H';
  customHInput.min = '1';

  const customApplyBtn = document.createElement('button');
  customApplyBtn.className = 'browser-viewport-custom-apply';
  customApplyBtn.textContent = 'Apply';

  customForm.appendChild(customWInput);
  customForm.appendChild(customSep);
  customForm.appendChild(customHInput);
  customForm.appendChild(customApplyBtn);
  viewportDropdown.appendChild(customForm);

  viewportWrapper.appendChild(viewportBtn);
  viewportWrapper.appendChild(viewportDropdown);

  const inspectBtn = document.createElement('button');
  inspectBtn.className = 'browser-inspect-btn';
  inspectBtn.textContent = 'Inspect';
  inspectBtn.ariaLabel = 'Inspect element';

  const recordBtn = document.createElement('button');
  recordBtn.className = 'browser-record-btn';
  recordBtn.textContent = 'Record';
  recordBtn.title = 'Record browser flow';
  recordBtn.ariaLabel = 'Record browser flow';

  const drawBtn = document.createElement('button');
  drawBtn.className = 'browser-draw-btn';
  drawBtn.textContent = 'Draw';
  drawBtn.title = 'Draw on page and send annotated screenshot to AI';
  drawBtn.ariaLabel = 'Draw on page';

  const authBtn = document.createElement('button');
  authBtn.className = 'browser-auth-btn';
  authBtn.textContent = 'Login';
  authBtn.title = 'Manage saved login credentials';
  authBtn.ariaLabel = 'Manage saved login credentials';

  toolbarNavShell.appendChild(backBtn);
  toolbarNavShell.appendChild(fwdBtn);
  toolbarNavShell.appendChild(reloadBtn);
  toolbarNavShell.appendChild(homeBtn);
  toolbarNav.appendChild(toolbarNavShell);

  toolbarAddressShell.appendChild(urlInput);
  toolbarAddressShell.appendChild(goBtn);
  toolbarAddress.appendChild(toolbarAddressShell);

  viewCluster.controls.appendChild(viewportWrapper);
  viewCluster.controls.appendChild(authBtn);
  captureCluster.controls.appendChild(inspectBtn);
  captureCluster.controls.appendChild(recordBtn);
  captureCluster.controls.appendChild(drawBtn);

  toolbarToolsShell.appendChild(viewCluster.element);
  toolbarToolsShell.appendChild(captureCluster.element);
  toolbarTools.appendChild(toolbarToolsShell);

  toolbar.appendChild(toolbarNav);
  toolbar.appendChild(toolbarAddress);
  toolbar.appendChild(toolbarTools);
  el.appendChild(toolbar);

  const viewportContainer = document.createElement('div');
  viewportContainer.className = 'browser-viewport-container responsive';

  const dragOverlay = document.createElement('div');
  dragOverlay.className = 'browser-drag-overlay';
  viewportContainer.appendChild(dragOverlay);

  const newTabPage = document.createElement('div');
  newTabPage.className = 'browser-new-tab-page';
  newTabPage.dataset.mode = url === 'about:blank' ? 'default' : 'hidden';

  const ntpHero = document.createElement('div');
  ntpHero.className = 'browser-ntp-hero';

  const ntpHeroTop = document.createElement('div');
  ntpHeroTop.className = 'browser-ntp-hero-top';

  const ntpEyebrow = document.createElement('div');
  ntpEyebrow.className = 'browser-ntp-eyebrow shell-kicker';
  ntpEyebrow.textContent = 'Live View';

  const ntpState = document.createElement('div');
  ntpState.className = 'browser-ntp-state';
  ntpState.dataset.state = 'default';
  ntpState.textContent = 'Ready to capture';

  ntpHeroTop.appendChild(ntpEyebrow);
  ntpHeroTop.appendChild(ntpState);
  ntpHero.appendChild(ntpHeroTop);

  const ntpTitle = document.createElement('div');
  ntpTitle.className = 'browser-ntp-title';
  ntpTitle.textContent = 'Open a running surface';
  ntpHero.appendChild(ntpTitle);

  const ntpSubtitle = document.createElement('div');
  ntpSubtitle.className = 'browser-ntp-subtitle';
  ntpSubtitle.textContent = 'Jump into a running app, capture the right context, and route it into the session you choose without leaving Calder.';
  ntpHero.appendChild(ntpSubtitle);

  const ntpActions = document.createElement('div');
  ntpActions.className = 'browser-ntp-actions';

  const focusAddressBtn = document.createElement('button');
  focusAddressBtn.className = 'browser-ntp-action';
  focusAddressBtn.textContent = 'Focus address bar';

  const refreshTargetsBtn = document.createElement('button');
  refreshTargetsBtn.className = 'browser-ntp-action browser-ntp-action-secondary';
  refreshTargetsBtn.textContent = 'Rescan localhost';

  ntpActions.appendChild(focusAddressBtn);
  ntpActions.appendChild(refreshTargetsBtn);
  ntpHero.appendChild(ntpActions);

  const ntpCapabilities = document.createElement('div');
  ntpCapabilities.className = 'browser-ntp-capabilities';
  for (const label of ['Inspect DOM', 'Annotate visually', 'Record flow']) {
    const chip = document.createElement('span');
    chip.className = 'browser-ntp-capability control-chip';
    chip.textContent = label;
    ntpCapabilities.appendChild(chip);
  }
  ntpHero.appendChild(ntpCapabilities);
  newTabPage.appendChild(ntpHero);

  const ntpLayout = document.createElement('div');
  ntpLayout.className = 'browser-ntp-layout';

  const ntpTargets = document.createElement('section');
  ntpTargets.className = 'browser-ntp-panel browser-ntp-targets';

  const ntpTargetsHeader = document.createElement('div');
  ntpTargetsHeader.className = 'browser-ntp-section-header';

  const ntpTargetsTitle = document.createElement('div');
  ntpTargetsTitle.className = 'browser-ntp-section-title shell-kicker';
  ntpTargetsTitle.textContent = 'Local surfaces';
  ntpTargetsHeader.appendChild(ntpTargetsTitle);

  const ntpTargetsMeta = document.createElement('div');
  ntpTargetsMeta.className = 'browser-ntp-section-meta';
  ntpTargetsMeta.textContent = 'Scanning…';
  ntpTargetsHeader.appendChild(ntpTargetsMeta);

  ntpTargets.appendChild(ntpTargetsHeader);

  const ntpTargetsText = document.createElement('div');
  ntpTargetsText.className = 'browser-ntp-section-copy';
  ntpTargetsText.textContent = 'Scanning for active localhost targets…';
  ntpTargets.appendChild(ntpTargetsText);

  const ntpGrid = document.createElement('div');
  ntpGrid.className = 'browser-ntp-grid';
  ntpTargets.appendChild(ntpGrid);

  function resetNewTabCopy(): void {
    newTabPage.dataset.mode = 'default';
    ntpState.dataset.state = 'default';
    ntpState.textContent = 'Ready to capture';
    ntpTitle.textContent = 'Open a running surface';
    ntpSubtitle.textContent = 'Jump into a running app, capture the right context, and route it into the session you choose without leaving Calder.';
    ntpTargetsText.textContent = 'Scanning for active localhost targets…';
    ntpTargetsMeta.textContent = 'Scanning…';
  }

  function syncBrowserStatus(state: BrowserPageState): void {
    statusBadge.dataset.state = state;
    statusBadge.textContent = describeBrowserPageState(state);
    chromeHint.textContent = state === 'loading'
      ? 'Waiting for page'
      : state === 'offline'
        ? 'Surface unavailable'
        : state === 'local'
          ? 'Live local surface'
          : state === 'remote'
            ? 'External page'
            : 'Capture context';
    goBtn.textContent = state === 'loading' ? 'Stop' : 'Go';
    goBtn.classList.toggle('loading', state === 'loading');
    goBtn.ariaLabel = state === 'loading' ? 'Stop page load' : 'Open address';
  }

  function showOfflineState(failedUrl: string): void {
    const isLocalSurface = isLocalBrowserUrl(failedUrl);

    ntpState.dataset.state = isLocalSurface ? 'offline' : 'unavailable';
    ntpState.textContent = 'Offline';
    ntpTitle.textContent = 'Surface offline';
    ntpSubtitle.textContent = isLocalSurface
      ? `${failedUrl} is not reachable right now. Start the local app again, then reload or rescan localhost.`
      : `${failedUrl} could not be opened right now. Try reloading, pasting a different URL, or choosing another local surface.`;
    ntpTargetsText.textContent = isLocalSurface
      ? 'Start the local app again, then rescan localhost or paste a different URL above.'
      : 'Paste a different URL above, or choose another running localhost surface.';
    ntpTargetsMeta.textContent = isLocalSurface ? 'Offline' : 'Unavailable';
    ntpGrid.innerHTML = '';

    const offlineCard = document.createElement('div');
    offlineCard.className = 'browser-ntp-empty';
    offlineCard.textContent = isLocalSurface
      ? 'Start the local app again, then choose another running localhost surface or paste a new URL.'
      : 'This page could not be opened right now. Choose another running surface or paste a different URL.';
    ntpGrid.appendChild(offlineCard);
    newTabPage.dataset.mode = 'offline';
    syncSurfaceVisibility(true);
  }

  const ntpWorkflow = document.createElement('section');
  ntpWorkflow.className = 'browser-ntp-panel browser-ntp-workflow';

  const ntpWorkflowTitle = document.createElement('div');
  ntpWorkflowTitle.className = 'browser-ntp-section-title shell-kicker';
  ntpWorkflowTitle.textContent = 'How it works';
  ntpWorkflow.appendChild(ntpWorkflowTitle);

  const ntpWorkflowList = document.createElement('div');
  ntpWorkflowList.className = 'browser-ntp-flow';
  const flowSteps = [
    ['01', 'Open a surface', 'Start with a running app, a localhost surface, or any manual URL.'],
    ['02', 'Capture the right context', 'Inspect an element, draw on the page, or record a reproducible browser flow.'],
    ['03', 'Hand off to session', 'Route the page context into a new or open session without leaving Calder.'],
  ] as const;

  for (const [index, title, copy] of flowSteps) {
    const step = document.createElement('div');
    step.className = 'browser-ntp-flow-step';
    step.innerHTML = `
      <span class="browser-ntp-flow-index">${index}</span>
      <div class="browser-ntp-flow-copy">
        <div class="browser-ntp-flow-title">${title}</div>
        <div class="browser-ntp-flow-text">${copy}</div>
      </div>
    `;
    ntpWorkflowList.appendChild(step);
  }
  ntpWorkflow.appendChild(ntpWorkflowList);

  ntpLayout.appendChild(ntpTargets);
  ntpLayout.appendChild(ntpWorkflow);
  newTabPage.appendChild(ntpLayout);

  const webview = document.createElement('webview') as unknown as WebviewElement;
  webview.className = 'browser-webview';
  webview.setAttribute('partition', resolveBrowserPartitionForSession(sessionId));

  function syncSurfaceVisibility(showEmptySurface: boolean): void {
    newTabPage.style.display = showEmptySurface ? 'flex' : 'none';
    newTabPage.setAttribute('aria-hidden', showEmptySurface ? 'false' : 'true');
    webview.dataset.surface = showEmptySurface ? 'hidden' : 'live';
    webview.hidden = showEmptySurface;
    webview.setAttribute('aria-hidden', showEmptySurface ? 'true' : 'false');
  }

  syncSurfaceVisibility(!url || url === 'about:blank');

  const contentShell = document.createElement('div');
  contentShell.className = 'browser-content-shell live-view-surface live-view';
  contentShell.appendChild(viewportContainer);
  contentShell.appendChild(newTabPage);
  el.appendChild(contentShell);

  const inspectPanel = document.createElement('div');
  inspectPanel.className = 'browser-inspect-panel';
  inspectPanel.classList.add('calder-popover');
  inspectPanel.style.display = 'none';

  const inspectHandle = document.createElement('div');
  inspectHandle.className = 'browser-inspect-panel-handle';

  const inspectHandleLabel = document.createElement('span');
  inspectHandleLabel.className = 'browser-inspect-panel-handle-label';
  inspectHandleLabel.textContent = 'Element capture';

  const inspectHandleGrip = document.createElement('span');
  inspectHandleGrip.className = 'browser-inspect-panel-handle-grip';
  inspectHandleGrip.textContent = 'Move';

  inspectHandle.appendChild(inspectHandleLabel);
  inspectHandle.appendChild(inspectHandleGrip);
  inspectPanel.appendChild(inspectHandle);

  const inspectHeader = document.createElement('div');
  inspectHeader.className = 'browser-capture-header';

  const inspectCopy = document.createElement('div');
  inspectCopy.className = 'browser-capture-copy';

  const inspectKicker = document.createElement('div');
  inspectKicker.className = 'browser-capture-kicker';
  inspectKicker.textContent = 'Inspect target';

  const inspectTitle = document.createElement('div');
  inspectTitle.className = 'browser-capture-title';
  inspectTitle.textContent = 'Select an element';

  const inspectSubtitle = document.createElement('div');
  inspectSubtitle.className = 'browser-capture-subtitle';
  inspectSubtitle.textContent = 'Click a page element to capture its selector and send a focused prompt.';

  inspectCopy.appendChild(inspectKicker);
  inspectCopy.appendChild(inspectTitle);
  inspectCopy.appendChild(inspectSubtitle);

  const inspectChip = document.createElement('span');
  inspectChip.className = 'browser-capture-chip';
  inspectChip.textContent = 'Inspect';

  inspectHeader.appendChild(inspectCopy);
  inspectHeader.appendChild(inspectChip);
  inspectPanel.appendChild(inspectHeader);

  const elementInfoEl = document.createElement('div');
  elementInfoEl.className = 'inspect-element-info';
  inspectPanel.appendChild(elementInfoEl);

  const inputRow = document.createElement('div');
  inputRow.className = 'inspect-input-row';

  const instructionInput = document.createElement('textarea');
  instructionInput.className = 'inspect-instruction-input';
  instructionInput.rows = 3;
  instructionInput.placeholder = 'Describe what you want to do\u2026';

  const submitGroup = document.createElement('div');
  submitGroup.className = 'inspect-submit-group';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'inspect-submit-btn';
  submitBtn.textContent = 'Send to selected';

  const customBtn = document.createElement('button');
  customBtn.className = 'inspect-dropdown-btn browser-target-trigger';
  customBtn.textContent = 'Select Session \u25BE';
  customBtn.title = 'Choose target session';

  submitGroup.appendChild(submitBtn);
  submitGroup.appendChild(customBtn);

  inputRow.appendChild(instructionInput);
  inspectPanel.appendChild(inputRow);

  const inspectAttachDimsRow = document.createElement('label');
  inspectAttachDimsRow.className = 'inspect-attach-dims-row';
  const inspectAttachDimsCheckbox = document.createElement('input');
  inspectAttachDimsCheckbox.type = 'checkbox';
  inspectAttachDimsCheckbox.checked = true;
  const inspectAttachDimsText = document.createElement('span');
  inspectAttachDimsText.textContent = 'Attach browser dimensions to the instructions';
  inspectAttachDimsRow.appendChild(inspectAttachDimsCheckbox);
  inspectAttachDimsRow.appendChild(inspectAttachDimsText);
  inspectPanel.appendChild(inspectAttachDimsRow);

  const inspectErrorEl = document.createElement('div');
  inspectErrorEl.className = 'inspect-error-text';
  inspectPanel.appendChild(inspectErrorEl);

  const inspectContextTraceEl = document.createElement('div');
  inspectContextTraceEl.className = 'inspect-context-trace';
  inspectPanel.appendChild(inspectContextTraceEl);

  inspectPanel.appendChild(submitGroup);
  el.appendChild(inspectPanel);

  const drawPanel = document.createElement('div');
  drawPanel.className = 'browser-inspect-panel browser-draw-panel';
  drawPanel.classList.add('calder-popover');
  drawPanel.style.display = 'none';

  const drawHeader = document.createElement('div');
  drawHeader.className = 'browser-capture-header';

  const drawCopy = document.createElement('div');
  drawCopy.className = 'browser-capture-copy';

  const drawKicker = document.createElement('div');
  drawKicker.className = 'browser-capture-kicker';
  drawKicker.textContent = 'Annotated capture';

  const drawTitle = document.createElement('div');
  drawTitle.className = 'browser-capture-title';
  drawTitle.textContent = 'Mark the page, then hand it off';

  const drawSubtitle = document.createElement('div');
  drawSubtitle.className = 'browser-capture-subtitle';
  drawSubtitle.textContent = 'Sketch directly on the surface and send the annotated screenshot with your instructions.';

  drawCopy.appendChild(drawKicker);
  drawCopy.appendChild(drawTitle);
  drawCopy.appendChild(drawSubtitle);

  const drawChip = document.createElement('span');
  drawChip.className = 'browser-capture-chip';
  drawChip.textContent = 'Draw';

  drawHeader.appendChild(drawCopy);
  drawHeader.appendChild(drawChip);
  drawPanel.appendChild(drawHeader);

  const drawControlsRow = document.createElement('div');
  drawControlsRow.className = 'inspect-input-row';

  const drawInstructionInput = document.createElement('textarea');
  drawInstructionInput.className = 'inspect-instruction-input';
  drawInstructionInput.rows = 3;
  drawInstructionInput.placeholder = 'Describe what you want to do\u2026';

  const drawSubmitGroup = document.createElement('div');
  drawSubmitGroup.className = 'inspect-submit-group';

  const drawClearBtn = document.createElement('button');
  drawClearBtn.className = 'inspect-clear-btn';
  drawClearBtn.textContent = 'Clear';
  drawClearBtn.title = 'Clear drawing';

  const drawSubmitBtn = document.createElement('button');
  drawSubmitBtn.className = 'inspect-submit-btn';
  drawSubmitBtn.textContent = 'Send to selected';

  const drawCustomBtn = document.createElement('button');
  drawCustomBtn.className = 'inspect-dropdown-btn browser-target-trigger';
  drawCustomBtn.textContent = 'Select Session \u25BE';
  drawCustomBtn.title = 'Choose target session';

  drawSubmitGroup.appendChild(drawSubmitBtn);
  drawSubmitGroup.appendChild(drawCustomBtn);

  const drawActions = document.createElement('div');
  drawActions.className = 'inspect-draw-actions';
  drawActions.appendChild(drawClearBtn);
  drawActions.appendChild(drawSubmitGroup);

  drawControlsRow.appendChild(drawInstructionInput);
  drawPanel.appendChild(drawControlsRow);

  const drawAttachDimsRow = document.createElement('label');
  drawAttachDimsRow.className = 'inspect-attach-dims-row';
  const drawAttachDimsCheckbox = document.createElement('input');
  drawAttachDimsCheckbox.type = 'checkbox';
  drawAttachDimsCheckbox.checked = true;
  const drawAttachDimsText = document.createElement('span');
  drawAttachDimsText.textContent = 'Attach browser dimensions to the instructions';
  drawAttachDimsRow.appendChild(drawAttachDimsCheckbox);
  drawAttachDimsRow.appendChild(drawAttachDimsText);
  drawPanel.appendChild(drawAttachDimsRow);

  const drawErrorEl = document.createElement('div');
  drawErrorEl.className = 'inspect-error-text';
  drawPanel.appendChild(drawErrorEl);

  const drawContextTraceEl = document.createElement('div');
  drawContextTraceEl.className = 'inspect-context-trace';
  drawPanel.appendChild(drawContextTraceEl);

  drawPanel.appendChild(drawActions);
  el.appendChild(drawPanel);

  // Flow Panel
  const flowPanel = document.createElement('div');
  flowPanel.className = 'browser-capture-panel browser-flow-panel';
  flowPanel.style.display = 'none';

  const flowHeader = document.createElement('div');
  flowHeader.className = 'flow-panel-header';

  const flowCopy = document.createElement('div');
  flowCopy.className = 'browser-capture-copy';

  const flowKicker = document.createElement('div');
  flowKicker.className = 'browser-capture-kicker';
  flowKicker.textContent = 'Recorded flow';

  const flowLabel = document.createElement('span');
  flowLabel.className = 'flow-panel-label';
  flowLabel.textContent = 'Flow (0 steps)';

  const flowSubtitle = document.createElement('div');
  flowSubtitle.className = 'browser-capture-subtitle';
  flowSubtitle.textContent = 'Capture a short browser path and route it into an AI session as a reproducible handoff.';

  flowCopy.appendChild(flowKicker);
  flowCopy.appendChild(flowLabel);
  flowCopy.appendChild(flowSubtitle);

  const flowChip = document.createElement('span');
  flowChip.className = 'browser-capture-chip';
  flowChip.textContent = 'Flow';

  const flowClearBtn = document.createElement('button');
  flowClearBtn.className = 'flow-panel-clear-btn';
  flowClearBtn.textContent = 'Clear';

  const flowHeaderActions = document.createElement('div');
  flowHeaderActions.className = 'inspect-draw-actions';
  flowHeaderActions.appendChild(flowChip);
  flowHeaderActions.appendChild(flowClearBtn);

  flowHeader.appendChild(flowCopy);
  flowHeader.appendChild(flowHeaderActions);
  flowPanel.appendChild(flowHeader);

  const flowStepsList = document.createElement('div');
  flowStepsList.className = 'flow-steps-list';
  flowPanel.appendChild(flowStepsList);

  const flowInputRow = document.createElement('div');
  flowInputRow.className = 'flow-input-row';
  flowInputRow.style.display = 'none';

  const flowInstructionInput = document.createElement('textarea');
  flowInstructionInput.className = 'flow-instruction-input';
  flowInstructionInput.placeholder = 'Describe what to do with this flow\u2026';
  flowInstructionInput.rows = 2;

  const flowSubmitGroup = document.createElement('div');
  flowSubmitGroup.className = 'inspect-submit-group';

  const flowSubmitBtn = document.createElement('button');
  flowSubmitBtn.className = 'inspect-submit-btn';
  flowSubmitBtn.textContent = 'Send to selected';

  const flowCustomBtn = document.createElement('button');
  flowCustomBtn.className = 'inspect-dropdown-btn browser-target-trigger';
  flowCustomBtn.textContent = 'Select Session \u25BE';
  flowCustomBtn.title = 'Choose target session';

  flowSubmitGroup.appendChild(flowSubmitBtn);
  flowSubmitGroup.appendChild(flowCustomBtn);
  flowInputRow.appendChild(flowInstructionInput);
  flowInputRow.appendChild(flowSubmitGroup);
  flowPanel.appendChild(flowInputRow);

  const flowErrorEl = document.createElement('div');
  flowErrorEl.className = 'inspect-error-text';
  flowPanel.appendChild(flowErrorEl);

  const flowContextTraceEl = document.createElement('div');
  flowContextTraceEl.className = 'inspect-context-trace';
  flowPanel.appendChild(flowContextTraceEl);

  el.appendChild(flowPanel);

  // Flow action picker popup
  const flowPickerOverlay = document.createElement('div');
  flowPickerOverlay.className = 'flow-picker-overlay';
  flowPickerOverlay.style.display = 'none';

  const flowPickerMenu = document.createElement('div');
  flowPickerMenu.className = 'flow-picker-menu';

  const pickerOptions: { label: string; sub: string; action: FlowPickerAction }[] = [
    { label: 'Click',          sub: 'Navigate without recording', action: 'click' },
    { label: 'Record',         sub: 'Capture without clicking',   action: 'record' },
    { label: 'Click + Record', sub: 'Click and add step',         action: 'click-and-record' },
  ];
  for (const opt of pickerOptions) {
    const item = document.createElement('button');
    item.className = 'flow-picker-item';
    item.dataset['action'] = opt.action;
    const labelEl = document.createElement('span');
    labelEl.className = 'flow-picker-label';
    labelEl.textContent = opt.label;
    const subEl = document.createElement('span');
    subEl.className = 'flow-picker-sub';
    subEl.textContent = opt.sub;
    item.appendChild(labelEl);
    item.appendChild(subEl);
    flowPickerMenu.appendChild(item);
  }
  flowPickerOverlay.appendChild(flowPickerMenu);
  el.appendChild(flowPickerOverlay);

  const targetMenu = document.createElement('div');
  targetMenu.className = 'browser-target-menu';
  targetMenu.classList.add('calder-popover');
  targetMenu.style.display = 'none';

  const targetMenuList = document.createElement('div');
  targetMenuList.className = 'browser-target-menu-list';
  targetMenu.appendChild(targetMenuList);
  el.appendChild(targetMenu);

  const authPanel = document.createElement('div');
  authPanel.className = 'browser-capture-panel browser-auth-panel';
  authPanel.classList.add('calder-popover');
  authPanel.style.display = 'none';

  const authHeader = document.createElement('div');
  authHeader.className = 'browser-capture-header';

  const authCopy = document.createElement('div');
  authCopy.className = 'browser-capture-copy';

  const authKicker = document.createElement('div');
  authKicker.className = 'browser-capture-kicker';
  authKicker.textContent = 'Saved login';

  const authTitle = document.createElement('div');
  authTitle.className = 'browser-capture-title';
  authTitle.textContent = 'Credential vault';

  const authSubtitle = document.createElement('div');
  authSubtitle.className = 'browser-capture-subtitle';
  authSubtitle.textContent = 'Save credentials securely, fill them in one click, and remove them whenever you want.';

  const authOriginEl = document.createElement('div');
  authOriginEl.className = 'browser-auth-origin';
  authOriginEl.textContent = 'No page origin';

  authCopy.appendChild(authKicker);
  authCopy.appendChild(authTitle);
  authCopy.appendChild(authSubtitle);
  authCopy.appendChild(authOriginEl);

  const authChip = document.createElement('span');
  authChip.className = 'browser-capture-chip';
  authChip.textContent = 'Login';

  authHeader.appendChild(authCopy);
  authHeader.appendChild(authChip);
  authPanel.appendChild(authHeader);

  const authForm = document.createElement('div');
  authForm.className = 'browser-auth-form';

  const authProfileField = document.createElement('label');
  authProfileField.className = 'browser-auth-field';
  const authProfileLabel = document.createElement('span');
  authProfileLabel.className = 'browser-auth-field-label';
  authProfileLabel.textContent = 'Saved profiles';
  const authProfileSelect = document.createElement('select');
  authProfileSelect.className = 'browser-auth-select';
  authProfileField.appendChild(authProfileLabel);
  authProfileField.appendChild(authProfileSelect);
  authForm.appendChild(authProfileField);

  const authLabelField = document.createElement('label');
  authLabelField.className = 'browser-auth-field';
  const authLabelText = document.createElement('span');
  authLabelText.className = 'browser-auth-field-label';
  authLabelText.textContent = 'Profile name';
  const authLabelInput = document.createElement('input');
  authLabelInput.className = 'browser-auth-input';
  authLabelInput.type = 'text';
  authLabelInput.placeholder = 'Work account';
  authLabelField.appendChild(authLabelText);
  authLabelField.appendChild(authLabelInput);
  authForm.appendChild(authLabelField);

  const authUsernameField = document.createElement('label');
  authUsernameField.className = 'browser-auth-field';
  const authUsernameText = document.createElement('span');
  authUsernameText.className = 'browser-auth-field-label';
  authUsernameText.textContent = 'Username / email';
  const authUsernameInput = document.createElement('input');
  authUsernameInput.className = 'browser-auth-input';
  authUsernameInput.type = 'text';
  authUsernameInput.autocomplete = 'username';
  authUsernameInput.placeholder = 'name@example.com';
  authUsernameField.appendChild(authUsernameText);
  authUsernameField.appendChild(authUsernameInput);
  authForm.appendChild(authUsernameField);

  const authPasswordField = document.createElement('label');
  authPasswordField.className = 'browser-auth-field';
  const authPasswordText = document.createElement('span');
  authPasswordText.className = 'browser-auth-field-label';
  authPasswordText.textContent = 'Password';
  const authPasswordInput = document.createElement('input');
  authPasswordInput.className = 'browser-auth-input';
  authPasswordInput.type = 'password';
  authPasswordInput.autocomplete = 'current-password';
  authPasswordInput.placeholder = '••••••••';
  authPasswordField.appendChild(authPasswordText);
  authPasswordField.appendChild(authPasswordInput);
  authForm.appendChild(authPasswordField);

  const authAutoFillRow = document.createElement('label');
  authAutoFillRow.className = 'browser-auth-autofill-row';
  const authAutoFillCheckbox = document.createElement('input');
  authAutoFillCheckbox.type = 'checkbox';
  const authAutoFillText = document.createElement('span');
  authAutoFillText.textContent = 'Auto-fill this profile on page load';
  authAutoFillRow.appendChild(authAutoFillCheckbox);
  authAutoFillRow.appendChild(authAutoFillText);
  authForm.appendChild(authAutoFillRow);

  authPanel.appendChild(authForm);

  const authStatusEl = document.createElement('div');
  authStatusEl.className = 'browser-auth-status';
  authPanel.appendChild(authStatusEl);

  const authActions = document.createElement('div');
  authActions.className = 'browser-auth-actions';

  const authDeleteBtn = document.createElement('button');
  authDeleteBtn.className = 'browser-auth-btn-secondary';
  authDeleteBtn.textContent = 'Delete';
  authDeleteBtn.type = 'button';

  const authSaveBtn = document.createElement('button');
  authSaveBtn.className = 'browser-auth-btn-secondary';
  authSaveBtn.textContent = 'Save';
  authSaveBtn.type = 'button';

  const authFillBtn = document.createElement('button');
  authFillBtn.className = 'browser-auth-btn-primary';
  authFillBtn.textContent = 'Fill now';
  authFillBtn.type = 'button';

  authActions.appendChild(authDeleteBtn);
  authActions.appendChild(authSaveBtn);
  authActions.appendChild(authFillBtn);
  authPanel.appendChild(authActions);
  el.appendChild(authPanel);

  let authPanelFloatingCleanup: (() => void) | null = null;
  let authSelectedCredentialId: string | null = null;
  let authCredentialList: BrowserCredentialSummary[] = [];

  const instance: BrowserTabInstance = {
    sessionId,
    element: el,
    webview,
    webviewReady: false,
    statusBadge,
    toolbarHint: chromeHint,
    committedUrl: normalizeUrl(url || ''),
    contentShell,
    viewportContainer,
    newTabPage,
    urlInput,
    goBtn,
    inspectBtn,
    viewportBtn,
    viewportDropdown,
    inspectPanel,
    inspectTitleEl: inspectTitle,
    inspectSubtitleEl: inspectSubtitle,
    instructionInput,
    submitBtn,
    inspectTargetBtn: customBtn,
    inspectAttachDimsCheckbox,
    inspectErrorEl,
    inspectContextTraceEl,
    elementInfoEl,
    inspectMode: false,
    selectedElement: null,
    currentViewport: VIEWPORT_PRESETS[0],
    isLoading: false,
    viewportOutsideClickHandler: () => {},
    viewportDropdownFloatingCleanup: null,
    recordBtn,
    flowPanel,
    flowPanelLabel: flowLabel,
    flowStepsList,
    flowInputRow,
    flowInstructionInput,
    flowSubmitBtn,
    flowTargetBtn: flowCustomBtn,
    flowErrorEl,
    flowContextTraceEl,
    flowMode: false,
    flowSteps: [],
    flowPickerOverlay,
    flowPickerMenu,
    flowPickerPending: null,
    drawBtn,
    drawPanel,
    drawInstructionInput,
    drawSubmitBtn,
    drawTargetBtn: drawCustomBtn,
    drawAttachDimsCheckbox,
    drawErrorEl,
    drawContextTraceEl,
    drawMode: false,
    targetMenu,
    targetMenuList,
    targetMenuOutsideClickHandler: () => {},
    targetMenuFloatingCleanup: null,
    activeTargetTrigger: null,
    activeTargetMode: null,
    syncSurfaceVisibility: () => {},
    syncAddressBarState: () => {},
    syncToolbarState: () => {},
    cleanupFns: [],
  };
  instances.set(sessionId, instance);
  instance.syncSurfaceVisibility = syncSurfaceVisibility;
  instance.syncToolbarState = () => {
    const mode = resolveCaptureModeState(instance);
    const modeText =
      mode === 'inspect' ? 'Inspecting'
        : mode === 'draw' ? 'Drawing'
          : mode === 'flow' ? 'Recording'
            : 'Idle';
    captureCluster.label.textContent = 'Capture';
    captureCluster.element.dataset.captureMode = mode;

    const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
    captureCluster.label.title = selectedTarget
      ? `Mode: ${modeText} · Target: ${getProviderDisplayName(selectedTarget.providerId ?? 'claude')} / ${selectedTarget.name}`
      : `Mode: ${modeText} · Target: none`;

    inspectBtn.textContent = instance.inspectMode ? 'Inspecting' : 'Inspect';
    inspectBtn.dataset.state = instance.inspectMode ? 'active' : 'idle';
    inspectBtn.title = instance.inspectMode
      ? 'Inspect mode is active'
      : 'Inspect element';
    inspectBtn.ariaLabel = inspectBtn.title;

    drawBtn.textContent = instance.drawMode ? 'Drawing' : 'Draw';
    drawBtn.dataset.state = instance.drawMode ? 'active' : 'idle';
    drawBtn.title = instance.drawMode
      ? 'Draw mode is active'
      : 'Draw on page and send annotated screenshot to AI';
    drawBtn.ariaLabel = drawBtn.title;

    recordBtn.textContent = instance.flowMode ? 'Recording' : 'Record';
    recordBtn.dataset.state = instance.flowMode ? 'active' : 'idle';
    recordBtn.title = instance.flowMode
      ? 'Flow recording is active'
      : 'Record browser flow';
    recordBtn.ariaLabel = recordBtn.title;
  };

  function syncAuthActionsEnabledState(): void {
    const hasOrigin = Boolean(resolveCredentialOrigin(instance.committedUrl || urlInput.value || webview.src));
    const hasManualCredentials = authUsernameInput.value.trim().length > 0 && authPasswordInput.value.length > 0;
    authSaveBtn.disabled = !hasOrigin || !hasManualCredentials;
    authFillBtn.disabled = !hasOrigin || (!authSelectedCredentialId && !hasManualCredentials);
    authDeleteBtn.disabled = !authSelectedCredentialId;
  }

  function setAuthStatus(message: string, tone: 'neutral' | 'success' | 'error' = 'neutral'): void {
    authStatusEl.textContent = message;
    authStatusEl.dataset.tone = tone;
  }

  function applyAuthSelectionToInputs(summary: BrowserCredentialSummary | null): void {
    if (!summary) {
      authLabelInput.value = '';
      authUsernameInput.value = '';
      authAutoFillCheckbox.checked = false;
      syncAuthActionsEnabledState();
      return;
    }
    authLabelInput.value = summary.label;
    authUsernameInput.value = summary.username;
    authPasswordInput.value = '';
    authAutoFillCheckbox.checked = summary.autoFill;
    syncAuthActionsEnabledState();
  }

  function getCredentialTargetUrl(): string | null {
    const candidate = instance.committedUrl || urlInput.value || webview.src;
    return resolveCredentialOrigin(candidate) ? candidate : null;
  }

  function currentCredentialOriginLabel(): string {
    const url = getCredentialTargetUrl();
    if (!url) return 'No HTTP(S) page selected';
    try {
      return new URL(url).origin;
    } catch {
      return 'No HTTP(S) page selected';
    }
  }

  function closeAuthPanel(): void {
    authPanel.style.display = 'none';
    authPanelFloatingCleanup?.();
    authPanelFloatingCleanup = null;
    authBtn.dataset.state = 'idle';
  }

  async function refreshCredentialProfiles(preferredId?: string | null): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    authProfileSelect.innerHTML = '';
    authCredentialList = [];
    authSelectedCredentialId = null;
    authOriginEl.textContent = currentCredentialOriginLabel();

    if (!targetUrl) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Open an HTTP(S) page first';
      authProfileSelect.appendChild(option);
      applyAuthSelectionToInputs(null);
      return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a saved profile';
    authProfileSelect.appendChild(defaultOption);

    authCredentialList = await window.calder.browserCredential.listForUrl(targetUrl);
    for (const summary of authCredentialList) {
      const option = document.createElement('option');
      option.value = summary.id;
      option.textContent = `${summary.label} · ${summary.username}`;
      authProfileSelect.appendChild(option);
    }

    const nextSelectedId = preferredId
      ?? authCredentialList.find((entry) => entry.autoFill)?.id
      ?? null;
    if (nextSelectedId && authCredentialList.some((entry) => entry.id === nextSelectedId)) {
      authProfileSelect.value = nextSelectedId;
      authSelectedCredentialId = nextSelectedId;
      applyAuthSelectionToInputs(authCredentialList.find((entry) => entry.id === nextSelectedId) ?? null);
      return;
    }

    authProfileSelect.value = '';
    applyAuthSelectionToInputs(null);
  }

  async function fillCredentialPayload(payload: BrowserCredentialFillData): Promise<void> {
    if (!payload.username || !payload.password) {
      setAuthStatus('Selected profile is missing username or password.', 'error');
      return;
    }
    await sendGuestMessage(instance.webview, 'auth-fill-credentials', {
      username: payload.username,
      password: payload.password,
    });
  }

  async function maybeAutoFillCredentials(): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) return;
    const payload = await window.calder.browserCredential.getAutoFillForUrl(targetUrl);
    if (!payload) return;
    await fillCredentialPayload(payload);
    setAuthStatus(`Auto-filled ${payload.label}.`, 'success');
  }

  async function saveCredentialFromForm(): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) {
      setAuthStatus('Open an HTTP(S) page before saving credentials.', 'error');
      return;
    }
    const input: BrowserCredentialSaveInput = {
      id: authSelectedCredentialId ?? undefined,
      url: targetUrl,
      label: authLabelInput.value,
      username: authUsernameInput.value,
      password: authPasswordInput.value,
      autoFill: authAutoFillCheckbox.checked,
    };
    const saved = await window.calder.browserCredential.saveForUrl(input);
    authPasswordInput.value = '';
    setAuthStatus(`Saved profile: ${saved.label}.`, 'success');
    await refreshCredentialProfiles(saved.id);
  }

  async function deleteSelectedCredential(): Promise<void> {
    if (!authSelectedCredentialId) {
      setAuthStatus('Select a saved profile first.', 'error');
      return;
    }
    const result = await window.calder.browserCredential.deleteById(authSelectedCredentialId);
    if (!result.deleted) {
      setAuthStatus('Selected profile could not be deleted.', 'error');
      return;
    }
    authSelectedCredentialId = null;
    authPasswordInput.value = '';
    setAuthStatus('Saved profile deleted.', 'success');
    await refreshCredentialProfiles();
  }

  async function fillFromProfileOrForm(): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) {
      setAuthStatus('Open an HTTP(S) page before filling credentials.', 'error');
      return;
    }

    if (authSelectedCredentialId) {
      const payload = await window.calder.browserCredential.getForFill(targetUrl, authSelectedCredentialId);
      if (!payload) {
        setAuthStatus('Selected profile is unavailable for this page.', 'error');
        return;
      }
      await fillCredentialPayload(payload);
      setAuthStatus(`Filled profile: ${payload.label}.`, 'success');
      return;
    }

    const manualUsername = authUsernameInput.value.trim();
    const manualPassword = authPasswordInput.value;
    if (!manualUsername || !manualPassword) {
      setAuthStatus('Enter username and password, or choose a saved profile.', 'error');
      return;
    }
    await sendGuestMessage(instance.webview, 'auth-fill-credentials', {
      username: manualUsername,
      password: manualPassword,
    });
    setAuthStatus('Filled credentials from the form.', 'success');
  }

  authProfileSelect.addEventListener('change', () => {
    authSelectedCredentialId = authProfileSelect.value || null;
    const selected = authCredentialList.find((entry) => entry.id === authSelectedCredentialId) ?? null;
    applyAuthSelectionToInputs(selected);
    setAuthStatus(selected ? `Selected profile: ${selected.label}.` : 'Create a new profile or choose an existing one.');
  });

  authLabelInput.addEventListener('input', () => syncAuthActionsEnabledState());
  authUsernameInput.addEventListener('input', () => syncAuthActionsEnabledState());
  authPasswordInput.addEventListener('input', () => syncAuthActionsEnabledState());
  authAutoFillCheckbox.addEventListener('change', () => syncAuthActionsEnabledState());

  authSaveBtn.addEventListener('click', () => {
    void saveCredentialFromForm().catch((error) => {
      setAuthStatus(error instanceof Error ? error.message : 'Failed to save credentials.', 'error');
    });
  });
  authDeleteBtn.addEventListener('click', () => {
    void deleteSelectedCredential().catch((error) => {
      setAuthStatus(error instanceof Error ? error.message : 'Failed to delete credentials.', 'error');
    });
  });
  authFillBtn.addEventListener('click', () => {
    void fillFromProfileOrForm().catch((error) => {
      setAuthStatus(error instanceof Error ? error.message : 'Failed to fill credentials.', 'error');
    });
  });

  authBtn.addEventListener('click', () => {
    if (authPanel.style.display !== 'none') {
      closeAuthPanel();
      return;
    }

    setAuthStatus('Loading saved profiles…');
    authPanel.style.display = 'flex';
    authBtn.dataset.state = 'active';
    authPanelFloatingCleanup?.();
    authPanelFloatingCleanup = anchorFloatingSurface(authBtn, authPanel, {
      placement: 'bottom-end',
      offsetPx: 6,
      maxWidthPx: 360,
      maxHeightPx: 440,
    });

    void refreshCredentialProfiles()
      .then(() => {
        setAuthStatus(authCredentialList.length > 0
          ? 'Saved profiles ready.'
          : 'No saved profiles for this page yet.');
      })
      .catch((error) => {
        setAuthStatus(error instanceof Error ? error.message : 'Failed to load saved profiles.', 'error');
      });
  });

  const authPanelOutsideClickHandler = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!authPanel.contains(target) && !authBtn.contains(target)) {
      closeAuthPanel();
    }
  };
  document.addEventListener('mousedown', authPanelOutsideClickHandler);
  instance.cleanupFns.push(() => {
    document.removeEventListener('mousedown', authPanelOutsideClickHandler);
    authPanelFloatingCleanup?.();
    authPanelFloatingCleanup = null;
  });

  instance.cleanupFns.push(enablePopoverDragging(instance, inspectPanel, inspectHandle));
  focusAddressBtn.addEventListener('click', () => {
    urlInput.focus();
    urlInput.select();
  });
  refreshTargetsBtn.addEventListener('click', () => {
    resetNewTabCopy();
    void populateLocalTargets(instance, ntpGrid, ntpTargetsText, ntpTargetsMeta);
  });
  void populateLocalTargets(instance, ntpGrid, ntpTargetsText, ntpTargetsMeta);

  const syncTargetingUi = () => syncBrowserTargetControls(instance);
  instance.cleanupFns.push(appState.on('session-added', syncTargetingUi));
  instance.cleanupFns.push(appState.on('session-removed', syncTargetingUi));
  instance.cleanupFns.push(appState.on('session-changed', syncTargetingUi));
  instance.cleanupFns.push(appState.on('project-changed', syncTargetingUi));
  syncTargetingUi();
  instance.syncToolbarState();

  function syncNavigationControls(instance: BrowserTabInstance): void {
    if (!instance.webviewReady) {
      backBtn.disabled = true;
      fwdBtn.disabled = true;
      backBtn.title = 'Open a page before navigating back';
      fwdBtn.title = 'Open a page before navigating forward';
      return;
    }

    backBtn.disabled = !instance.webview.canGoBack();
    fwdBtn.disabled = !instance.webview.canGoForward();
    backBtn.title = backBtn.disabled ? 'No page behind this one yet' : 'Back';
    fwdBtn.title = fwdBtn.disabled ? 'No forward page yet' : 'Forward';
  }

  function syncAddressBarState(instance: BrowserTabInstance): void {
    const normalizedDraft = normalizeUrl(urlInput.value);
    const hasUnappliedAddressChange = normalizedDraft !== instance.committedUrl;
    urlInput.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false';
    toolbarAddressShell.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false';

    if (instance.isLoading) {
      goBtn.dataset.state = 'stop';
      goBtn.textContent = 'Stop';
      goBtn.title = 'Stop the current page load';
      goBtn.ariaLabel = 'Stop page load';
    } else if (!hasUnappliedAddressChange && instance.committedUrl && instance.committedUrl !== 'about:blank') {
      goBtn.dataset.state = 'reload';
      goBtn.textContent = 'Reload';
      goBtn.title = 'Reload current page';
      goBtn.ariaLabel = 'Reload current page';
    } else {
      goBtn.dataset.state = 'open';
      goBtn.textContent = 'Open';
      goBtn.title = normalizedDraft ? 'Open typed address' : 'Open address';
      goBtn.ariaLabel = 'Open address';
    }

    reloadBtn.disabled = !instance.webviewReady || instance.isLoading || hasUnappliedAddressChange;
    if (instance.committedUrl === 'about:blank') {
      reloadBtn.disabled = true;
    }
    reloadBtn.title = instance.isLoading
      ? 'Wait for the current page to finish loading'
      : hasUnappliedAddressChange
        ? 'Apply the typed address before reloading'
        : instance.committedUrl === 'about:blank'
          ? 'Open a page before reloading'
          : 'Reload';
  }
  instance.syncAddressBarState = () => syncAddressBarState(instance);

  function reloadCurrentPage(): void {
    if (!instance.webviewReady) return;
    webview.reload();
  }

  function openBrowserHome(): void {
    resetNewTabCopy();
    navigateTo(instance, 'about:blank');
    void populateLocalTargets(instance, ntpGrid, ntpTargetsText, ntpTargetsMeta);
  }

  webview.addEventListener('before-input-event', ((e: CustomEvent & { preventDefault(): void; input: { type: string; key: string; shift: boolean; control: boolean; alt: boolean; meta: boolean } }) => {
    if (e.input.type !== 'keyDown') return;
    if ((e.input.meta || e.input.control) && e.input.key.toLowerCase() === 'l') {
      e.preventDefault();
      urlInput.focus();
      urlInput.select();
      return;
    }
    if ((e.input.meta || e.input.control) && e.input.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (instance.isLoading) {
        webview.stop();
      } else {
        reloadCurrentPage();
      }
      return;
    }
    const synthetic = {
      key: e.input.key,
      ctrlKey: e.input.control,
      metaKey: e.input.meta,
      shiftKey: e.input.shift,
      altKey: e.input.alt,
      preventDefault: () => e.preventDefault(),
    } as KeyboardEvent;
    shortcutManager.matchEvent(synthetic);
  }) as EventListener);

  void getPreloadPath()
    .then((preloadPath) => {
      webview.setAttribute('preload', `file://${preloadPath}`);
    })
    .catch((err) => {
      console.error('Failed to resolve browser guest preload path', err);
    })
    .finally(() => {
      webview.src = instance.committedUrl || url || 'about:blank';
      viewportContainer.appendChild(webview);
    });

  backBtn.addEventListener('click', () => webview.goBack());
  fwdBtn.addEventListener('click', () => webview.goForward());
  reloadBtn.addEventListener('click', () => reloadCurrentPage());
  homeBtn.addEventListener('click', () => openBrowserHome());

  goBtn.addEventListener('click', () => {
    if (instance.isLoading) {
      try { webview.stop(); } catch {}
      instance.isLoading = false;
      syncBrowserStatus(resolveBrowserPageState(urlInput.value.trim(), false, false));
      syncNavigationControls(instance);
      syncAddressBarState(instance);
      return;
    }

    const normalizedDraft = normalizeUrl(urlInput.value);
    if (
      normalizedDraft
      && normalizedDraft === instance.committedUrl
      && instance.committedUrl !== 'about:blank'
    ) {
      if (!instance.webviewReady) {
        navigateTo(instance, instance.committedUrl);
      } else {
        reloadCurrentPage();
      }
      return;
    }
    navigateTo(instance, urlInput.value);
  });
  urlInput.addEventListener('focus', () => {
    urlInput.select();
  });
  urlInput.addEventListener('input', () => {
    syncAddressBarState(instance);
  });
  urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      navigateTo(instance, urlInput.value);
      webview.focus();
    }
    if (e.key === 'Escape') {
      urlInput.value = instance.committedUrl || webview.src || urlInput.value;
      urlInput.blur();
      syncAddressBarState(instance);
      webview.focus();
    }
  });

  viewportBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    if (viewportDropdown.classList.contains('visible')) {
      closeViewportDropdown(instance, 'trigger-toggle');
    } else {
      customForm.style.display = 'none';
      openViewportDropdown(instance, 'trigger-toggle');
    }
  });

  function eventPathContains(event: MouseEvent, node: HTMLElement): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(node)) return true;
    const target = event.target as Node | null;
    return Boolean(target && node.contains(target));
  }

  instance.viewportOutsideClickHandler = (e: MouseEvent) => {
    if (
      !eventPathContains(e, viewportWrapper)
      && !eventPathContains(e, viewportBtn)
      && !eventPathContains(e, viewportDropdown)
    ) {
      closeViewportDropdown(instance, 'outside-press');
    }
  };
  const outsidePressEventName: 'pointerdown' | 'mousedown' = (
    typeof window !== 'undefined' && 'PointerEvent' in window
  ) ? 'pointerdown' : 'mousedown';
  document.addEventListener(outsidePressEventName, instance.viewportOutsideClickHandler);

  instance.targetMenuOutsideClickHandler = (e: MouseEvent) => {
    if (
      !eventPathContains(e, instance.targetMenu)
      && !eventPathContains(e, instance.inspectTargetBtn)
      && !eventPathContains(e, instance.drawTargetBtn)
      && !eventPathContains(e, instance.flowTargetBtn)
    ) {
      closeBrowserTargetMenu(instance, 'outside-press');
    }
  };
  document.addEventListener(outsidePressEventName, instance.targetMenuOutsideClickHandler);

  customItem.addEventListener('click', () => {
    customForm.style.display = 'flex';
    customWInput.focus();
  });

  function applyCustomSize(): void {
    const w = parseInt(customWInput.value, 10);
    const h = parseInt(customHInput.value, 10);
    if (w > 0 && h > 0) {
      applyViewport(instance, { label: 'Custom', width: w, height: h });
      closeViewportDropdown(instance, 'custom-apply');
    }
  }

  customApplyBtn.addEventListener('click', applyCustomSize);
  customWInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') applyCustomSize(); });
  customHInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') applyCustomSize(); });

  inspectBtn.addEventListener('click', () => toggleInspectMode(instance));
  recordBtn.addEventListener('click', () => toggleFlowMode(instance));
  drawBtn.addEventListener('click', () => toggleDrawMode(instance));
  drawClearBtn.addEventListener('click', () => clearDrawing(instance));
  drawSubmitBtn.addEventListener('click', () => { void sendDrawToSelectedSession(instance); });
  drawCustomBtn.addEventListener('click', () => openBrowserTargetMenu(instance, drawCustomBtn, 'draw'));
  drawInstructionInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendDrawToSelectedSession(instance);
    } else if (e.key === 'Escape') { dismissDraw(instance); }
  });
  flowClearBtn.addEventListener('click', () => clearFlow(instance));
  flowSubmitBtn.addEventListener('click', () => { void sendFlowToSelectedSession(instance); });
  flowCustomBtn.addEventListener('click', () => openBrowserTargetMenu(instance, flowCustomBtn, 'flow'));

  flowPickerMenu.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('.flow-picker-item');
    if (!item || !instance.flowPickerPending) return;
    const action = item.dataset['action'] as FlowPickerAction;
    const metadata = instance.flowPickerPending;
    dismissFlowPicker(instance);
    if (action === 'click' || action === 'click-and-record') {
      const selectorValues = metadata.selectorValues?.length
        ? metadata.selectorValues
        : metadata.selectors.map((selector) => selector.value).filter((value) => value.trim().length > 0);
      const replayPayload: FlowReplayPayload = {
        selectors: selectorValues,
        shadowHostSelectors: metadata.shadowHostSelectors,
        clickPoint: metadata.clickPoint,
        isCanvasLike: metadata.isCanvasLike,
        tagName: metadata.tagName,
      };
      void sendGuestMessage(instance.webview, 'flow-do-click', replayPayload);
    }
    if (action === 'record' || action === 'click-and-record') {
      addFlowStep(instance, {
        type: action === 'record' ? 'expect' : 'click',
        tagName: metadata.tagName,
        textContent: metadata.textContent,
        selectors: metadata.selectors,
        activeSelector: metadata.selectors[0],
        shadowHostSelectors: metadata.shadowHostSelectors,
        clickPoint: metadata.clickPoint,
        isCanvasLike: metadata.isCanvasLike,
        pageUrl: metadata.pageUrl,
      });
    }
  });

  flowPickerOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === flowPickerOverlay) dismissFlowPicker(instance);
  });

  submitBtn.addEventListener('click', () => { void sendToSelectedSession(instance); });
  customBtn.addEventListener('click', () => openBrowserTargetMenu(instance, customBtn, 'inspect'));
  instructionInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendToSelectedSession(instance);
    } else if (e.key === 'Escape') dismissInspect(instance);
  });

  function recordNavigationStep(url: string): void {
    const lastStep = instance.flowSteps[instance.flowSteps.length - 1];
    if (lastStep?.type === 'navigate' && lastStep.url === url) return;
    addFlowStep(instance, { type: 'navigate', url });
  }

  webview.addEventListener('did-start-loading', (() => {
    instance.isLoading = true;
    syncBrowserStatus(resolveBrowserPageState(urlInput.value.trim(), true, false));
    syncNavigationControls(instance);
    syncAddressBarState(instance);
  }) as EventListener);

  webview.addEventListener('dom-ready', (() => {
    instance.webviewReady = true;
    if (instance.inspectMode) void sendGuestMessage(instance.webview, 'enter-inspect-mode');
    if (instance.flowMode) void sendGuestMessage(instance.webview, 'enter-flow-mode');
    if (instance.drawMode) void sendGuestMessage(instance.webview, 'enter-draw-mode');
    void maybeAutoFillCredentials().catch((error) => {
      setAuthStatus(error instanceof Error ? error.message : 'Auto-fill failed.', 'error');
    });
    syncNavigationControls(instance);
    syncAddressBarState(instance);
  }) as EventListener);

  webview.addEventListener('did-stop-loading', (() => {
    instance.isLoading = false;
    syncBrowserStatus(resolveBrowserPageState(urlInput.value.trim(), false, false));
    syncNavigationControls(instance);
    syncAddressBarState(instance);
  }) as EventListener);

  webview.addEventListener('did-navigate', ((e: Event & { url: string }) => {
    if (isStaleNavigationRevert(instance, e.url)) return;
    if (e.url === 'about:blank') {
      if (newTabPage.dataset.mode !== 'offline') {
        resetNewTabCopy();
      }
      syncSurfaceVisibility(true);
    } else {
      resetNewTabCopy();
      syncSurfaceVisibility(false);
    }
    instance.committedUrl = e.url;
    urlInput.value = e.url;
    syncBrowserStatus(resolveBrowserPageState(e.url, instance.isLoading, false));
    syncNavigationControls(instance);
    syncAddressBarState(instance);
    appState.updateSessionBrowserTabUrl(sessionId, e.url);
    clearPendingNavigation(instance);
    if (instance.flowMode) recordNavigationStep(e.url);
    if (authPanel.style.display !== 'none') {
      void refreshCredentialProfiles(authSelectedCredentialId).catch((error) => {
        setAuthStatus(error instanceof Error ? error.message : 'Failed to refresh saved profiles.', 'error');
      });
    }
  }) as EventListener);
  webview.addEventListener('did-navigate-in-page', ((e: Event & { url: string }) => {
    if (isStaleNavigationRevert(instance, e.url)) return;
    if (e.url === 'about:blank') {
      if (newTabPage.dataset.mode !== 'offline') {
        resetNewTabCopy();
      }
      syncSurfaceVisibility(true);
    } else {
      resetNewTabCopy();
      syncSurfaceVisibility(false);
    }
    instance.committedUrl = e.url;
    urlInput.value = e.url;
    syncBrowserStatus(resolveBrowserPageState(e.url, instance.isLoading, false));
    syncNavigationControls(instance);
    syncAddressBarState(instance);
    appState.updateSessionBrowserTabUrl(sessionId, e.url);
    clearPendingNavigation(instance);
    if (instance.flowMode) recordNavigationStep(e.url);
    if (authPanel.style.display !== 'none') {
      void refreshCredentialProfiles(authSelectedCredentialId).catch((error) => {
        setAuthStatus(error instanceof Error ? error.message : 'Failed to refresh saved profiles.', 'error');
      });
    }
  }) as EventListener);
  webview.addEventListener('did-fail-load', ((e: Event & {
    isMainFrame?: boolean;
    validatedURL?: string;
    errorCode?: number;
    errorDescription?: string;
  }) => {
    const normalizedError = e.errorDescription?.toUpperCase() ?? '';
    if (e.errorCode === -3 || normalizedError.includes('ERR_ABORTED')) return;
    if (e.isMainFrame === false) return;
    const failedUrl = e.validatedURL || urlInput.value.trim();
    if (isStaleNavigationRevert(instance, failedUrl)) return;
    if (!failedUrl) return;
    instance.isLoading = false;
    instance.committedUrl = failedUrl;
    syncBrowserStatus(resolveBrowserPageState(failedUrl, false, true));
    syncNavigationControls(instance);
    syncAddressBarState(instance);
    showOfflineState(failedUrl);
    if (isLocalBrowserUrl(failedUrl)) {
      appState.passivateBrowserTabSession(sessionId, failedUrl);
    }
    if (failedUrl !== 'about:blank') {
      // Keep the failed URL visible in the address bar while stopping the
      // guest view, instead of bouncing through about:blank and emitting
      // another noisy Electron load failure.
      try { webview.stop(); } catch {}
    }
    clearPendingNavigation(instance);
  }) as EventListener);

  syncBrowserStatus(resolveBrowserPageState(urlInput.value.trim(), false, false));
  syncNavigationControls(instance);
  syncAddressBarState(instance);
  syncAuthActionsEnabledState();

  webview.addEventListener('ipc-message', ((e: Event & { channel: string; args: unknown[] }) => {
    if (e.channel === 'element-selected') {
      const { metadata, x, y } = e.args[0] as { metadata: Omit<ElementInfo, 'activeSelector'>; x: number; y: number };
      const info: ElementInfo = {
        ...metadata,
        activeSelector: metadata.selectors[0] ?? { type: 'css', label: 'css', value: metadata.tagName },
      };
      showElementInfo(instance, info, x, y);
    } else if (e.channel === 'flow-element-picked') {
      const { metadata, x, y } = e.args[0] as { metadata: FlowPickerMetadata; x: number; y: number };
      showFlowPicker(instance, metadata, x, y);
    } else if (e.channel === 'draw-stroke-end') {
      const { x, y } = e.args[0] as { x: number; y: number };
      positionDrawPopover(instance, x, y);
    } else if (e.channel === 'browser-open-request') {
      const payload = e.args[0] as BrowserGuestOpenPayload;
      void handleBrowserGuestOpenRequest(payload, {
        openEmbedded: (nextUrl) => {
          const project = appState.projects.find((entry) =>
            entry.sessions.some((session) => session.id === instance.sessionId),
          );
          if (!project) return;
          appState.addBrowserTabSession(project.id, nextUrl, { dedupeByUrl: false });
        },
        openExternal: (nextUrl) => window.calder.app.openExternal(nextUrl),
      });
    } else if (e.channel === 'auth-fill-result') {
      const payload = e.args[0] as { filledUsername?: boolean; filledPassword?: boolean };
      const filledUsername = Boolean(payload?.filledUsername);
      const filledPassword = Boolean(payload?.filledPassword);
      if (filledUsername && filledPassword) {
        setAuthStatus('Credentials were filled on the page.', 'success');
      } else if (filledPassword) {
        setAuthStatus('Password field was filled.', 'success');
      } else if (filledUsername) {
        setAuthStatus('Username field was filled.', 'success');
      } else {
        setAuthStatus('No login inputs were found on this page.', 'error');
      }
    }
  }) as EventListener);
}

export function attachBrowserTabToContainer(sessionId: string, container: HTMLElement): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  container.appendChild(instance.element);
  syncBrowserTabToSessionState(instance);
}

export function showBrowserTabPane(sessionId: string, isSplit: boolean): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.element.classList.remove('hidden');
  instance.element.classList.remove('swarm-dimmed', 'swarm-unread');
  instance.element.classList.toggle('split', isSplit);
  requestAnimationFrame(() => syncBrowserTabToSessionState(instance));
}

export function hideAllBrowserTabPanes(): void {
  for (const instance of instances.values()) {
    instance.element.classList.add('hidden');
    instance.element.classList.remove('swarm-dimmed', 'swarm-unread');
  }
}

export function destroyBrowserTabPane(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  // Delete from the map first so errors below can't leave a half-destroyed instance around.
  instances.delete(sessionId);

  closeBrowserTargetMenu(instance, 'destroy');
  document.removeEventListener('pointerdown', instance.viewportOutsideClickHandler);
  document.removeEventListener('pointerdown', instance.targetMenuOutsideClickHandler);
  document.removeEventListener('mousedown', instance.viewportOutsideClickHandler);
  document.removeEventListener('mousedown', instance.targetMenuOutsideClickHandler);
  instance.viewportDropdownFloatingCleanup?.();
  instance.targetMenuFloatingCleanup?.();
  for (const cleanup of instance.cleanupFns) cleanup();

  // <webview> calls throw if it isn't attached + dom-ready yet. Guard each
  // one individually so a failure can't skip instance.element.remove() below.
  if (instance.inspectMode) void sendGuestMessage(instance.webview, 'exit-inspect-mode');
  if (instance.flowMode) void sendGuestMessage(instance.webview, 'exit-flow-mode');
  if (instance.drawMode) void sendGuestMessage(instance.webview, 'exit-draw-mode');
  try { instance.webview.stop(); } catch {}

  instance.element.remove();
}
