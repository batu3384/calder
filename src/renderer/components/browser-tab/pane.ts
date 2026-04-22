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
import {
  clearPendingNavigation,
  describeBrowserPageState,
  isLocalBrowserUrl,
  isStaleNavigationRevert,
  navigateTo,
  normalizeUrl,
  resolveBrowserPageState,
  type BrowserPageState,
} from './navigation.js';
import { enablePopoverDragging } from './popover.js';
import { applyViewport, openViewportDropdown, closeViewportDropdown } from './viewport.js';
import { toggleInspectMode, showElementInfo, dismissInspect } from './inspect-mode.js';
import {
  toggleDrawMode,
  clearDrawing,
  dismissDraw,
  sendDrawToSelectedSession,
  positionDrawPopover,
} from './draw-mode.js';
import { addFlowStep, clearFlow, toggleFlowMode } from './flow-recording.js';
import { showFlowPicker, dismissFlowPicker } from './flow-picker.js';
import { sendGuestMessage } from './guest-messaging.js';
import type {
  BrowserGuestOpenPayload,
} from '../../../shared/types/project.js';
import {
  sendFlowToSelectedSession,
  sendToSelectedSession,
} from './session-integration.js';
import { handleBrowserGuestOpenRequest } from './popup-routing.js';
import { createBrowserAuthPanel } from './auth-panel.js';
import { createBrowserAuthController } from './auth-controller.js';
import { populateLocalTargets } from './local-targets.js';
import {
  closeBrowserTargetMenu,
  openBrowserTargetMenu,
  syncBrowserTargetControls,
} from './target-menu.js';
import { createNewTabStateController } from './new-tab-state.js';
import {
  syncAddressBarState as syncBrowserAddressBarState,
  syncNavigationControls as syncBrowserNavigationControls,
} from './navigation-chrome.js';
import { createBrowserNewTabUi } from './new-tab-ui.js';
import {
  createBrowserToolbarCluster,
  resolveBrowserPartitionForSession,
  resolveCaptureModeState,
  resolveCredentialOrigin,
  syncBrowserTabToSessionState,
} from './pane-helpers.js';

export function createBrowserTabPane(sessionId: string, url?: string): void {
  initializeBrowserTabPane(sessionId, url);
}

function initializeBrowserTabPane(sessionId: string, url?: string): void {
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
  viewportBtn.type = 'button';
  viewportBtn.className = 'browser-viewport-btn';
  viewportBtn.textContent = 'Responsive';
  viewportBtn.title = 'Change viewport size';
  viewportBtn.ariaLabel = 'Change viewport size';
  viewportBtn.setAttribute('aria-haspopup', 'menu');
  viewportBtn.setAttribute('aria-expanded', 'false');

  const viewportDropdown = document.createElement('div');
  viewportDropdown.className = 'browser-viewport-dropdown';
  viewportDropdown.id = `browser-viewport-menu-${sessionId}`;
  viewportDropdown.setAttribute('role', 'menu');
  viewportDropdown.setAttribute('aria-label', 'Viewport presets');
  viewportBtn.setAttribute('aria-controls', viewportDropdown.id);

  const viewportMenuItems: HTMLButtonElement[] = [];

  const focusViewportMenuItem = (index: number): void => {
    if (viewportMenuItems.length === 0) return;
    const normalized = ((index % viewportMenuItems.length) + viewportMenuItems.length) % viewportMenuItems.length;
    viewportMenuItems.forEach((item) => { item.tabIndex = -1; });
    const nextItem = viewportMenuItems[normalized];
    nextItem.tabIndex = 0;
    nextItem.focus();
  };

  const focusSelectedViewportMenuItem = (): void => {
    const selectedIndex = viewportMenuItems.findIndex((item) => item.getAttribute('aria-checked') === 'true');
    focusViewportMenuItem(selectedIndex >= 0 ? selectedIndex : 0);
  };

  function openViewportMenu(
    reason = 'programmatic',
    focusMode: 'selected' | 'first' | 'last' | 'none' = 'selected',
  ): void {
    const showCustomForm = instance.currentViewport.label === 'Custom';
    customForm.style.display = showCustomForm ? 'flex' : 'none';
    customItem.setAttribute('aria-expanded', String(showCustomForm));
    openViewportDropdown(instance, reason);
    if (focusMode === 'none') return;
    requestAnimationFrame(() => {
      if (focusMode === 'first') {
        focusViewportMenuItem(0);
        return;
      }
      if (focusMode === 'last') {
        focusViewportMenuItem(viewportMenuItems.length - 1);
        return;
      }
      focusSelectedViewportMenuItem();
    });
  }

  function closeViewportMenu(reason = 'programmatic', returnFocus = false): void {
    closeViewportDropdown(instance, reason);
    customForm.style.display = 'none';
    customItem.setAttribute('aria-expanded', 'false');
    viewportMenuItems.forEach((item) => { item.tabIndex = -1; });
    if (returnFocus) {
      requestAnimationFrame(() => viewportBtn.focus());
    }
  }

  for (const preset of VIEWPORT_PRESETS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'browser-viewport-item';
    item.dataset.viewportKey = preset.label;
    item.textContent = preset.width !== null
      ? `${preset.label} — ${preset.width}×${preset.height}`
      : preset.label;
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', 'false');
    item.tabIndex = -1;
    item.addEventListener('click', () => {
      applyViewport(instance, preset);
      closeViewportMenu('preset-select');
    });
    viewportMenuItems.push(item);
    viewportDropdown.appendChild(item);
  }

  const customItem = document.createElement('button');
  customItem.type = 'button';
  customItem.className = 'browser-viewport-item browser-viewport-item-custom';
  customItem.dataset.viewportKey = 'Custom';
  customItem.textContent = 'Custom\u2026';
  customItem.setAttribute('role', 'menuitemradio');
  customItem.setAttribute('aria-checked', 'false');
  customItem.setAttribute('aria-expanded', 'false');
  customItem.tabIndex = -1;
  viewportMenuItems.push(customItem);
  viewportDropdown.appendChild(customItem);

  const customForm = document.createElement('div');
  customForm.className = 'browser-viewport-custom';
  customForm.setAttribute('role', 'group');
  customForm.setAttribute('aria-label', 'Custom viewport size');

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
  customApplyBtn.type = 'button';
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

  const {
    newTabPage,
    ntpState,
    ntpTitle,
    ntpSubtitle,
    ntpTargetsText,
    ntpTargetsMeta,
    ntpGrid,
    focusAddressBtn,
    refreshTargetsBtn,
  } = createBrowserNewTabUi(url === 'about:blank' ? 'default' : 'hidden');

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

  const newTabStateController = createNewTabStateController({
    elements: {
      newTabPage,
      ntpState,
      ntpTitle,
      ntpSubtitle,
      ntpTargetsText,
      ntpTargetsMeta,
      ntpGrid,
    },
    syncSurfaceVisibility,
    isLocalSurfaceUrl: isLocalBrowserUrl,
  });

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

  const {
    authPanel,
    authOriginEl,
    authProfileSelect,
    authLabelInput,
    authUsernameInput,
    authPasswordInput,
    authAutoFillCheckbox,
    authStatusEl,
    authDeleteBtn,
    authSaveBtn,
    authFillBtn,
    authCloseBtn,
  } = createBrowserAuthPanel();
  el.appendChild(authPanel);

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
  applyViewport(instance, VIEWPORT_PRESETS[0]);
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
  const authController = createBrowserAuthController({
    instance,
    authBtn,
    authElements: {
      authPanel,
      authOriginEl,
      authProfileSelect,
      authLabelInput,
      authUsernameInput,
      authPasswordInput,
      authAutoFillCheckbox,
      authStatusEl,
      authDeleteBtn,
      authSaveBtn,
      authFillBtn,
      authCloseBtn,
    },
    getUrlInputValue: () => urlInput.value,
    getWebviewSrc: () => webview.src,
    resolveCredentialOrigin,
  });
  instance.cleanupFns.push(() => authController.cleanup());

  instance.cleanupFns.push(enablePopoverDragging(instance, inspectPanel, inspectHandle));
  focusAddressBtn.addEventListener('click', () => {
    urlInput.focus();
    urlInput.select();
  });
  refreshTargetsBtn.addEventListener('click', () => {
    newTabStateController.resetNewTabCopy();
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
    syncBrowserNavigationControls({
      instance,
      backBtn,
      fwdBtn,
    });
  }

  function syncAddressBarState(instance: BrowserTabInstance): void {
    syncBrowserAddressBarState({
      instance,
      urlInput,
      toolbarAddressShell,
      goBtn,
      reloadBtn,
    });
  }
  instance.syncAddressBarState = () => syncAddressBarState(instance);

  function reloadCurrentPage(): void {
    if (!instance.webviewReady) return;
    webview.reload();
  }

  function openBrowserHome(): void {
    newTabStateController.resetNewTabCopy();
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
      closeViewportMenu('trigger-toggle');
    } else {
      openViewportMenu('trigger-toggle', 'selected');
    }
  });

  viewportBtn.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openViewportMenu('keyboard-arrow-down', 'selected');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openViewportMenu('keyboard-arrow-up', 'last');
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (viewportDropdown.classList.contains('visible')) {
        closeViewportMenu('keyboard-toggle', true);
      } else {
        openViewportMenu('keyboard-toggle', 'selected');
      }
    } else if (event.key === 'Escape' && viewportDropdown.classList.contains('visible')) {
      event.preventDefault();
      closeViewportMenu('keyboard-escape', true);
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
      closeViewportMenu('outside-press');
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

  viewportDropdown.addEventListener('keydown', (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeViewportMenu('keyboard-escape', true);
      return;
    }

    if (target instanceof HTMLInputElement) return;

    const focusedIndex = viewportMenuItems.findIndex((item) => item === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusViewportMenuItem(focusedIndex < 0 ? 0 : focusedIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusViewportMenuItem(focusedIndex < 0 ? viewportMenuItems.length - 1 : focusedIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusViewportMenuItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusViewportMenuItem(viewportMenuItems.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (document.activeElement instanceof HTMLButtonElement) {
        event.preventDefault();
        document.activeElement.click();
      }
    } else if (event.key === 'Tab') {
      closeViewportMenu('keyboard-tab');
    }
  });

  customItem.addEventListener('click', () => {
    customForm.style.display = 'flex';
    customItem.setAttribute('aria-expanded', 'true');
    customWInput.focus();
  });

  function applyCustomSize(): void {
    const w = parseInt(customWInput.value, 10);
    const h = parseInt(customHInput.value, 10);
    if (w > 0 && h > 0) {
      applyViewport(instance, { label: 'Custom', width: w, height: h });
      closeViewportMenu('custom-apply');
    }
  }

  customApplyBtn.addEventListener('click', applyCustomSize);
  customWInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') applyCustomSize();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeViewportMenu('keyboard-escape', true);
    }
  });
  customHInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') applyCustomSize();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeViewportMenu('keyboard-escape', true);
    }
  });

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
    void authController.maybeAutoFillCredentials().catch((error) => {
      authController.setStatus(error instanceof Error ? error.message : 'Auto-fill failed.', 'error');
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

  function handleCommittedNavigation(url: string): void {
    if (url === 'about:blank') {
      if (newTabPage.dataset.mode !== 'offline') {
        newTabStateController.resetNewTabCopy();
      }
      syncSurfaceVisibility(true);
    } else {
      newTabStateController.resetNewTabCopy();
      syncSurfaceVisibility(false);
    }
    instance.committedUrl = url;
    urlInput.value = url;
    syncBrowserStatus(resolveBrowserPageState(url, instance.isLoading, false));
    syncNavigationControls(instance);
    syncAddressBarState(instance);
    appState.updateSessionBrowserTabUrl(sessionId, url);
    clearPendingNavigation(instance);
    if (instance.flowMode) recordNavigationStep(url);
    authController.refreshProfilesIfPanelOpen();
  }

  webview.addEventListener('did-navigate', ((e: Event & { url: string }) => {
    if (isStaleNavigationRevert(instance, e.url)) return;
    handleCommittedNavigation(e.url);
  }) as EventListener);
  webview.addEventListener('did-navigate-in-page', ((e: Event & { url: string }) => {
    if (isStaleNavigationRevert(instance, e.url)) return;
    handleCommittedNavigation(e.url);
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
    newTabStateController.showOfflineState(failedUrl);
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
  authController.syncActionsEnabledState();

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
      authController.handleFillResult(payload);
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
