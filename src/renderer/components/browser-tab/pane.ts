import { appState } from '../../state.js';
import { shortcutManager } from '../../shortcuts.js';
import { getProviderDisplayName } from '../../provider-availability.js';
import {
  VIEWPORT_PRESETS,
  type BrowserTabInstance,
  type ElementInfo,
  type FlowPickerAction,
  type FlowPickerMetadata,
  type WebviewElement,
} from './types.js';
import { instances, getPreloadPath } from './instance.js';
import { navigateTo } from './navigation.js';
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
import {
  sendFlowToCustomSession,
  sendFlowToSelectedSession,
  sendFlowToNewSession,
  sendToCustomSession,
  sendToSelectedSession,
  sendToNewSession,
} from './session-integration.js';

function browserWorkspaceLabel(): string {
  const project = appState.activeProject;
  if (!project) return 'Workspace';
  return project.name;
}

function browserTargetButtonLabel(instance: BrowserTabInstance): string {
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  const label = selectedTarget?.name ?? 'Select Session';
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

function closeBrowserTargetMenu(instance: BrowserTabInstance): void {
  instance.targetMenu.style.display = 'none';
  instance.activeTargetTrigger = null;
  instance.activeTargetMode = null;
}

function runTargetMenuAction(instance: BrowserTabInstance, action: 'new' | 'custom'): void {
  const mode = instance.activeTargetMode;
  closeBrowserTargetMenu(instance);
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
      const button = document.createElement('button');
      button.className = 'browser-target-menu-item';
      if (selectedTarget?.id === session.id) {
        button.classList.add('active');
      }

      const label = document.createElement('span');
      label.className = 'browser-target-session-name';
      label.textContent = session.name;

      const meta = document.createElement('span');
      meta.className = 'browser-target-session-meta';
      const parts = [getProviderDisplayName(session.providerId ?? 'claude')];
      if (appState.activeProject?.activeSessionId === session.id) {
        parts.unshift('Active');
      }
      meta.textContent = parts.join(' · ');

      button.appendChild(label);
      button.appendChild(meta);
      button.addEventListener('click', () => {
        appState.setBrowserTargetSession(instance.sessionId, session.id);
        closeBrowserTargetMenu(instance);
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
  const hasTarget = !!selectedTarget;
  const primaryButtons = [instance.submitBtn, instance.drawSubmitBtn, instance.flowSubmitBtn];
  for (const button of primaryButtons) {
    button.disabled = !hasTarget;
    button.title = hasTarget
      ? `Send to ${selectedTarget.name}`
      : 'Select an open session target first';
  }

  const targetButtons = [instance.inspectTargetBtn, instance.drawTargetBtn, instance.flowTargetBtn];
  const label = `${browserTargetButtonLabel(instance)} ▾`;
  for (const button of targetButtons) {
    button.textContent = label;
    button.title = selectedTarget
      ? `Current target: ${getProviderDisplayName(selectedTarget.providerId ?? 'claude')} / ${selectedTarget.name}`
      : 'Choose which open session receives the browser prompt';
  }

  if (instance.targetMenu.style.display !== 'none') {
    renderBrowserTargetMenu(instance);
  }
}

function openBrowserTargetMenu(
  instance: BrowserTabInstance,
  trigger: HTMLButtonElement,
  mode: 'inspect' | 'draw' | 'flow',
): void {
  if (instance.activeTargetTrigger === trigger && instance.targetMenu.style.display !== 'none') {
    closeBrowserTargetMenu(instance);
    return;
  }

  instance.activeTargetTrigger = trigger;
  instance.activeTargetMode = mode;
  renderBrowserTargetMenu(instance);
  instance.targetMenu.style.display = 'flex';

  const paneRect = instance.element.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = instance.targetMenu.getBoundingClientRect();
  const left = Math.min(
    Math.max(12, triggerRect.right - paneRect.left - menuRect.width),
    Math.max(12, paneRect.width - menuRect.width - 12),
  );
  const top = Math.min(
    Math.max(12, triggerRect.bottom - paneRect.top + 6),
    Math.max(12, paneRect.height - menuRect.height - 12),
  );

  instance.targetMenu.style.left = `${left}px`;
  instance.targetMenu.style.top = `${top}px`;
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
  chromeLabel.textContent = 'Browser surface';

  const chromeWorkspace = document.createElement('div');
  chromeWorkspace.className = 'browser-pane-workspace';
  chromeWorkspace.textContent = browserWorkspaceLabel();

  const chromeHint = document.createElement('div');
  chromeHint.className = 'browser-pane-hint';
  chromeHint.textContent = 'Inspect, record, annotate';

  chrome.appendChild(chromeLabel);
  chrome.appendChild(chromeWorkspace);
  chrome.appendChild(chromeHint);
  el.appendChild(chrome);

  const toolbar = document.createElement('div');
  toolbar.className = 'browser-tab-toolbar';

  const toolbarNav = document.createElement('div');
  toolbarNav.className = 'browser-toolbar-nav';

  const toolbarAddress = document.createElement('div');
  toolbarAddress.className = 'browser-toolbar-address';

  const toolbarTools = document.createElement('div');
  toolbarTools.className = 'browser-toolbar-tools';
  toolbarTools.setAttribute('aria-label', 'Browser workspace tools');

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
  viewportBtn.textContent = 'Responsive';
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
      closeViewportDropdown(instance);
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
  inspectBtn.textContent = 'Inspect Element';
  inspectBtn.ariaLabel = 'Inspect element';

  const recordBtn = document.createElement('button');
  recordBtn.className = 'browser-record-btn';
  recordBtn.textContent = '\u25CF Record';
  recordBtn.title = 'Record browser flow';
  recordBtn.ariaLabel = 'Record browser flow';

  const drawBtn = document.createElement('button');
  drawBtn.className = 'browser-draw-btn';
  drawBtn.textContent = 'Draw';
  drawBtn.title = 'Draw on page and send annotated screenshot to AI';
  drawBtn.ariaLabel = 'Draw on page';

  toolbarNav.appendChild(backBtn);
  toolbarNav.appendChild(fwdBtn);
  toolbarNav.appendChild(reloadBtn);

  toolbarAddress.appendChild(urlInput);
  toolbarAddress.appendChild(goBtn);

  toolbarTools.appendChild(viewportWrapper);
  toolbarTools.appendChild(inspectBtn);
  toolbarTools.appendChild(recordBtn);
  toolbarTools.appendChild(drawBtn);

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
  newTabPage.style.display = url ? 'none' : 'flex';

  const ntpEyebrow = document.createElement('div');
  ntpEyebrow.className = 'browser-ntp-eyebrow shell-kicker';
  ntpEyebrow.textContent = 'Calder Workspace';
  newTabPage.appendChild(ntpEyebrow);

  const ntpTitle = document.createElement('div');
  ntpTitle.className = 'browser-ntp-title';
  ntpTitle.textContent = 'Inspect, annotate, and hand off live pages without leaving the session.';
  newTabPage.appendChild(ntpTitle);

  const ntpSubtitle = document.createElement('div');
  ntpSubtitle.className = 'browser-ntp-subtitle';
  ntpSubtitle.textContent = 'Open a local target, capture interface context, then hand the page off to a focused Calder session.';
  newTabPage.appendChild(ntpSubtitle);

  const ntpCapabilities = document.createElement('div');
  ntpCapabilities.className = 'browser-ntp-capabilities';
  for (const label of ['Inspect DOM', 'Annotate visually', 'Record flow']) {
    const chip = document.createElement('span');
    chip.className = 'browser-ntp-capability control-chip';
    chip.textContent = label;
    ntpCapabilities.appendChild(chip);
  }
  newTabPage.appendChild(ntpCapabilities);

  const ntpLayout = document.createElement('div');
  ntpLayout.className = 'browser-ntp-layout';

  const ntpTargets = document.createElement('section');
  ntpTargets.className = 'browser-ntp-panel browser-ntp-targets';

  const ntpTargetsTitle = document.createElement('div');
  ntpTargetsTitle.className = 'browser-ntp-section-title shell-kicker';
  ntpTargetsTitle.textContent = 'Common local targets';
  ntpTargets.appendChild(ntpTargetsTitle);

  const ntpTargetsText = document.createElement('div');
  ntpTargetsText.className = 'browser-ntp-section-copy';
  ntpTargetsText.textContent = 'Use these shortcuts for the most common dev servers, or type any custom address in the bar above.';
  ntpTargets.appendChild(ntpTargetsText);

  const ntpGrid = document.createElement('div');
  ntpGrid.className = 'browser-ntp-grid';
  const quickLinks = [
    { port: 'localhost:3000', meta: 'Primary app' },
    { port: 'localhost:5173', meta: 'Vite dev server' },
    { port: 'localhost:8080', meta: 'API or legacy app' },
    { port: 'localhost:4200', meta: 'Angular workspace' },
  ];
  for (const { port, meta } of quickLinks) {
    const btn = document.createElement('button');
    btn.className = 'browser-ntp-link';
    btn.innerHTML = `
      <span class="browser-ntp-link-label">${port}</span>
      <span class="browser-ntp-link-meta">${meta}</span>
    `;
    btn.addEventListener('click', () => navigateTo(instance, port));
    ntpGrid.appendChild(btn);
  }
  ntpTargets.appendChild(ntpGrid);

  const ntpWorkflow = document.createElement('section');
  ntpWorkflow.className = 'browser-ntp-panel browser-ntp-workflow';

  const ntpWorkflowTitle = document.createElement('div');
  ntpWorkflowTitle.className = 'browser-ntp-section-title shell-kicker';
  ntpWorkflowTitle.textContent = 'Calder flow';
  ntpWorkflow.appendChild(ntpWorkflowTitle);

  const ntpWorkflowList = document.createElement('div');
  ntpWorkflowList.className = 'browser-ntp-flow';
  const flowSteps = [
    ['01', 'Open a local surface', 'Start with a running app, localhost target, or any manual URL.'],
    ['02', 'Capture what matters', 'Inspect an element, draw on the page, or record a reproducible browser flow.'],
    ['03', 'Hand off to session', 'Send the page context into a new or custom session without leaving the workspace.'],
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

  viewportContainer.appendChild(newTabPage);

  const webview = document.createElement('webview') as unknown as WebviewElement;
  webview.className = 'browser-webview';
  webview.setAttribute('allowpopups', '');
  viewportContainer.appendChild(webview);

  const contentShell = document.createElement('div');
  contentShell.className = 'browser-content-shell';
  contentShell.appendChild(viewportContainer);
  el.appendChild(contentShell);

  const inspectPanel = document.createElement('div');
  inspectPanel.className = 'browser-inspect-panel';
  inspectPanel.style.display = 'none';

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
  submitBtn.textContent = 'Send to Session';

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

  inspectPanel.appendChild(submitGroup);
  el.appendChild(inspectPanel);

  const drawPanel = document.createElement('div');
  drawPanel.className = 'browser-inspect-panel browser-draw-panel';
  drawPanel.style.display = 'none';

  const drawHeader = document.createElement('div');
  drawHeader.className = 'inspect-tag-line';
  drawHeader.textContent = 'Draw on the page, then describe what you want.';
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
  drawSubmitBtn.textContent = 'Send to Session';

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

  drawPanel.appendChild(drawActions);
  el.appendChild(drawPanel);

  // Flow Panel
  const flowPanel = document.createElement('div');
  flowPanel.className = 'browser-flow-panel';
  flowPanel.style.display = 'none';

  const flowHeader = document.createElement('div');
  flowHeader.className = 'flow-panel-header';

  const flowLabel = document.createElement('span');
  flowLabel.className = 'flow-panel-label';
  flowLabel.textContent = 'Flow (0 steps)';

  const flowClearBtn = document.createElement('button');
  flowClearBtn.className = 'flow-panel-clear-btn';
  flowClearBtn.textContent = 'Clear';

  flowHeader.appendChild(flowLabel);
  flowHeader.appendChild(flowClearBtn);
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
  flowSubmitBtn.textContent = 'Send to Session';

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
  targetMenu.style.display = 'none';

  const targetMenuList = document.createElement('div');
  targetMenuList.className = 'browser-target-menu-list';
  targetMenu.appendChild(targetMenuList);
  el.appendChild(targetMenu);

  const instance: BrowserTabInstance = {
    sessionId,
    element: el,
    webview,
    contentShell,
    viewportContainer,
    newTabPage,
    urlInput,
    inspectBtn,
    viewportBtn,
    viewportDropdown,
    inspectPanel,
    instructionInput,
    submitBtn,
    inspectTargetBtn: customBtn,
    inspectAttachDimsCheckbox,
    inspectErrorEl,
    elementInfoEl,
    inspectMode: false,
    selectedElement: null,
    currentViewport: VIEWPORT_PRESETS[0],
    viewportOutsideClickHandler: () => {},
    recordBtn,
    flowPanel,
    flowPanelLabel: flowLabel,
    flowStepsList,
    flowInputRow,
    flowInstructionInput,
    flowSubmitBtn,
    flowTargetBtn: flowCustomBtn,
    flowErrorEl,
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
    drawMode: false,
    targetMenu,
    targetMenuList,
    targetMenuOutsideClickHandler: () => {},
    activeTargetTrigger: null,
    activeTargetMode: null,
    cleanupFns: [],
  };
  instances.set(sessionId, instance);

  const syncTargetingUi = () => syncBrowserTargetControls(instance);
  instance.cleanupFns.push(appState.on('session-added', syncTargetingUi));
  instance.cleanupFns.push(appState.on('session-removed', syncTargetingUi));
  instance.cleanupFns.push(appState.on('session-changed', syncTargetingUi));
  instance.cleanupFns.push(appState.on('project-changed', syncTargetingUi));
  syncTargetingUi();

  webview.addEventListener('before-input-event', ((e: CustomEvent & { preventDefault(): void; input: { type: string; key: string; shift: boolean; control: boolean; alt: boolean; meta: boolean } }) => {
    if (e.input.type !== 'keyDown') return;
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

  // Preload must be set before src to ensure the inspect script is injected
  getPreloadPath().then((p) => {
    webview.setAttribute('preload', `file://${p}`);
    if (url) webview.src = url;
  });

  backBtn.addEventListener('click', () => webview.goBack());
  fwdBtn.addEventListener('click', () => webview.goForward());
  reloadBtn.addEventListener('click', () => webview.reload());

  goBtn.addEventListener('click', () => navigateTo(instance, urlInput.value));
  urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') navigateTo(instance, urlInput.value);
  });

  viewportBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    if (viewportDropdown.classList.contains('visible')) {
      closeViewportDropdown(instance);
    } else {
      customForm.style.display = 'none';
      openViewportDropdown(instance);
    }
  });

  instance.viewportOutsideClickHandler = (e: MouseEvent) => {
    if (!viewportWrapper.contains(e.target as Node)) {
      closeViewportDropdown(instance);
    }
  };
  document.addEventListener('mousedown', instance.viewportOutsideClickHandler);

  instance.targetMenuOutsideClickHandler = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!instance.targetMenu.contains(target) && !instance.inspectTargetBtn.contains(target) && !instance.drawTargetBtn.contains(target) && !instance.flowTargetBtn.contains(target)) {
      closeBrowserTargetMenu(instance);
    }
  };
  document.addEventListener('mousedown', instance.targetMenuOutsideClickHandler);

  customItem.addEventListener('click', () => {
    customForm.style.display = 'flex';
    customWInput.focus();
  });

  function applyCustomSize(): void {
    const w = parseInt(customWInput.value, 10);
    const h = parseInt(customHInput.value, 10);
    if (w > 0 && h > 0) {
      applyViewport(instance, { label: 'Custom', width: w, height: h });
      closeViewportDropdown(instance);
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
      instance.webview.send('flow-do-click', metadata.selectors[0]?.value ?? '');
    }
    if (action === 'record' || action === 'click-and-record') {
      addFlowStep(instance, {
        type: action === 'record' ? 'expect' : 'click',
        tagName: metadata.tagName,
        textContent: metadata.textContent,
        selectors: metadata.selectors,
        activeSelector: metadata.selectors[0],
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

  webview.addEventListener('did-navigate', ((e: CustomEvent) => {
    urlInput.value = e.url;
    newTabPage.style.display = 'none';
    appState.updateSessionBrowserTabUrl(sessionId, e.url);
    if (instance.flowMode) recordNavigationStep(e.url);
  }) as EventListener);
  webview.addEventListener('did-navigate-in-page', ((e: CustomEvent) => {
    urlInput.value = e.url;
    appState.updateSessionBrowserTabUrl(sessionId, e.url);
    if (instance.flowMode) recordNavigationStep(e.url);
  }) as EventListener);

  webview.addEventListener('ipc-message', ((e: CustomEvent) => {
    if (e.channel === 'element-selected') {
      const { metadata, x, y } = e.args[0] as { metadata: Omit<ElementInfo, 'activeSelector'>; x: number; y: number };
      const info: ElementInfo = { ...metadata, activeSelector: metadata.selectors[0] };
      showElementInfo(instance, info, x, y);
    } else if (e.channel === 'flow-element-picked') {
      const { metadata, x, y } = e.args[0] as { metadata: FlowPickerMetadata; x: number; y: number };
      showFlowPicker(instance, metadata, x, y);
    } else if (e.channel === 'draw-stroke-end') {
      const { x, y } = e.args[0] as { x: number; y: number };
      positionDrawPopover(instance, x, y);
    }
  }) as EventListener);
}

export function attachBrowserTabToContainer(sessionId: string, container: HTMLElement): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  container.appendChild(instance.element);
}

export function showBrowserTabPane(sessionId: string, isSplit: boolean): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.element.classList.remove('hidden');
  instance.element.classList.toggle('split', isSplit);
}

export function hideAllBrowserTabPanes(): void {
  for (const instance of instances.values()) {
    instance.element.classList.add('hidden');
  }
}

export function destroyBrowserTabPane(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  // Delete from the map first so errors below can't leave a half-destroyed instance around.
  instances.delete(sessionId);

  document.removeEventListener('mousedown', instance.viewportOutsideClickHandler);
  document.removeEventListener('mousedown', instance.targetMenuOutsideClickHandler);
  for (const cleanup of instance.cleanupFns) cleanup();

  // <webview> calls throw if it isn't attached + dom-ready yet. Guard each
  // one individually so a failure can't skip instance.element.remove() below.
  try { if (instance.inspectMode) instance.webview.send('exit-inspect-mode'); } catch {}
  try { if (instance.flowMode) instance.webview.send('exit-flow-mode'); } catch {}
  try { if (instance.drawMode) instance.webview.send('exit-draw-mode'); } catch {}
  try { instance.webview.stop(); } catch {}
  try { instance.webview.src = 'about:blank'; } catch {}

  instance.element.remove();
}
