import { createBrowserToolbarCluster } from './pane-helpers.js';

interface BrowserCaptureToolbarCluster {
  element: HTMLDivElement;
  label: HTMLSpanElement;
}

interface BrowserPaneChromeElements {
  chrome: HTMLDivElement;
  chromeHint: HTMLDivElement;
  statusBadge: HTMLSpanElement;
  trustZoneBadge: HTMLSpanElement;
}

interface BrowserToolbarStructure {
  toolbar: HTMLDivElement;
  toolbarAddressShell: HTMLDivElement;
  captureCluster: BrowserCaptureToolbarCluster;
}

interface BrowserNavControls {
  backBtn: HTMLButtonElement;
  fwdBtn: HTMLButtonElement;
  reloadBtn: HTMLButtonElement;
  homeBtn: HTMLButtonElement;
}

interface BrowserAddressControls {
  toolbarAddressShell: HTMLDivElement;
  urlInput: HTMLInputElement;
  goBtn: HTMLButtonElement;
}

interface BrowserViewportControls {
  viewportWrapper: HTMLDivElement;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  customItem: HTMLButtonElement;
  customForm: HTMLDivElement;
  customWInput: HTMLInputElement;
  customHInput: HTMLInputElement;
  customApplyBtn: HTMLButtonElement;
}

interface BrowserActionButtons {
  inspectBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  drawBtn: HTMLButtonElement;
  authBtn: HTMLButtonElement;
}

export interface BrowserTabPaneLayoutElements {
  el: HTMLDivElement;
  chromeHint: HTMLDivElement;
  statusBadge: HTMLSpanElement;
  trustZoneBadge: HTMLSpanElement;
  toolbarAddressShell: HTMLDivElement;
  captureCluster: BrowserCaptureToolbarCluster;
  backBtn: HTMLButtonElement;
  fwdBtn: HTMLButtonElement;
  reloadBtn: HTMLButtonElement;
  homeBtn: HTMLButtonElement;
  urlInput: HTMLInputElement;
  goBtn: HTMLButtonElement;
  viewportWrapper: HTMLDivElement;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  customItem: HTMLButtonElement;
  customForm: HTMLDivElement;
  customWInput: HTMLInputElement;
  customHInput: HTMLInputElement;
  customApplyBtn: HTMLButtonElement;
  inspectBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  drawBtn: HTMLButtonElement;
  authBtn: HTMLButtonElement;
  viewportContainer: HTMLDivElement;
}

function createBrowserPaneChrome(): BrowserPaneChromeElements {
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

  const trustZoneBadge = document.createElement('span');
  trustZoneBadge.className = 'browser-trust-zone-badge';
  trustZoneBadge.dataset.zone = 'unknown';
  trustZoneBadge.dataset.access = 'unknown';
  trustZoneBadge.textContent = 'Unknown';
  trustZoneBadge.title = 'Unknown browser surface. Runtime permissions are unchanged.';
  trustZoneBadge.setAttribute('aria-label', 'Unknown trust zone: unknown');

  chromeMeta.appendChild(statusBadge);
  chromeMeta.appendChild(trustZoneBadge);
  chromeMeta.appendChild(chromeHint);
  chrome.appendChild(chromeLabel);
  chrome.appendChild(chromeMeta);

  return {
    chrome,
    chromeHint,
    statusBadge,
    trustZoneBadge,
  };
}

function createBrowserNavControls(): BrowserNavControls {
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

  return { backBtn, fwdBtn, reloadBtn, homeBtn };
}

function createBrowserAddressControls(url?: string): BrowserAddressControls {
  const toolbarAddressShell = document.createElement('div');
  toolbarAddressShell.className = 'browser-toolbar-address-shell';

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

  toolbarAddressShell.appendChild(urlInput);
  toolbarAddressShell.appendChild(goBtn);
  return { toolbarAddressShell, urlInput, goBtn };
}

function createBrowserViewportControls(sessionId: string): BrowserViewportControls {
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

  const customItem = document.createElement('button');
  customItem.type = 'button';
  customItem.className = 'browser-viewport-item browser-viewport-item-custom';
  customItem.dataset.viewportKey = 'Custom';
  customItem.textContent = 'Custom\u2026';
  customItem.setAttribute('role', 'menuitemradio');
  customItem.setAttribute('aria-checked', 'false');
  customItem.setAttribute('aria-expanded', 'false');
  customItem.tabIndex = -1;

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
  viewportWrapper.appendChild(viewportBtn);
  viewportWrapper.appendChild(viewportDropdown);

  return {
    viewportWrapper,
    viewportBtn,
    viewportDropdown,
    customItem,
    customForm,
    customWInput,
    customHInput,
    customApplyBtn,
  };
}

function createBrowserActionButtons(): BrowserActionButtons {
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

  return { inspectBtn, recordBtn, drawBtn, authBtn };
}

function createBrowserToolbar(
  address: BrowserAddressControls,
  nav: BrowserNavControls,
  viewport: BrowserViewportControls,
  actions: BrowserActionButtons,
): BrowserToolbarStructure {
  const toolbar = document.createElement('div');
  toolbar.className = 'browser-tab-toolbar';

  const toolbarNav = document.createElement('div');
  toolbarNav.className = 'browser-toolbar-nav';
  const toolbarNavShell = document.createElement('div');
  toolbarNavShell.className = 'browser-toolbar-nav-shell';
  toolbarNavShell.appendChild(nav.backBtn);
  toolbarNavShell.appendChild(nav.fwdBtn);
  toolbarNavShell.appendChild(nav.reloadBtn);
  toolbarNavShell.appendChild(nav.homeBtn);
  toolbarNav.appendChild(toolbarNavShell);

  const toolbarAddress = document.createElement('div');
  toolbarAddress.className = 'browser-toolbar-address browser-toolbar-primary';
  toolbarAddress.appendChild(address.toolbarAddressShell);

  const toolbarTools = document.createElement('div');
  toolbarTools.className = 'browser-toolbar-tools';
  toolbarTools.setAttribute('aria-label', 'Live View tools');
  const toolbarToolsShell = document.createElement('div');
  toolbarToolsShell.className = 'browser-toolbar-tools-shell';

  const viewCluster = createBrowserToolbarCluster('View');
  viewCluster.element.dataset.kind = 'view';
  viewCluster.controls.appendChild(viewport.viewportWrapper);
  viewCluster.controls.appendChild(actions.authBtn);

  const captureCluster = createBrowserToolbarCluster('Capture');
  captureCluster.element.dataset.kind = 'capture';
  captureCluster.controls.appendChild(actions.inspectBtn);
  captureCluster.controls.appendChild(actions.recordBtn);
  captureCluster.controls.appendChild(actions.drawBtn);

  toolbarToolsShell.appendChild(viewCluster.element);
  toolbarToolsShell.appendChild(captureCluster.element);
  toolbarTools.appendChild(toolbarToolsShell);

  toolbar.appendChild(toolbarNav);
  toolbar.appendChild(toolbarAddress);
  toolbar.appendChild(toolbarTools);

  return { toolbar, toolbarAddressShell: address.toolbarAddressShell, captureCluster };
}

export function createBrowserTabPaneLayout(
  sessionId: string,
  url?: string,
): BrowserTabPaneLayoutElements {
  const el = document.createElement('div');
  el.className = 'browser-tab-pane hidden';
  el.dataset.sessionId = sessionId;

  const { chrome, chromeHint, statusBadge, trustZoneBadge } = createBrowserPaneChrome();
  el.appendChild(chrome);
  const nav = createBrowserNavControls();
  const address = createBrowserAddressControls(url);
  const viewport = createBrowserViewportControls(sessionId);
  const actions = createBrowserActionButtons();
  const { toolbar, toolbarAddressShell, captureCluster } = createBrowserToolbar(
    address,
    nav,
    viewport,
    actions,
  );
  el.appendChild(toolbar);

  const viewportContainer = document.createElement('div');
  viewportContainer.className = 'browser-viewport-container responsive';

  const dragOverlay = document.createElement('div');
  dragOverlay.className = 'browser-drag-overlay';
  viewportContainer.appendChild(dragOverlay);

  return {
    el,
    chromeHint,
    statusBadge,
    trustZoneBadge,
    toolbarAddressShell,
    captureCluster,
    backBtn: nav.backBtn,
    fwdBtn: nav.fwdBtn,
    reloadBtn: nav.reloadBtn,
    homeBtn: nav.homeBtn,
    urlInput: address.urlInput,
    goBtn: address.goBtn,
    viewportWrapper: viewport.viewportWrapper,
    viewportBtn: viewport.viewportBtn,
    viewportDropdown: viewport.viewportDropdown,
    customItem: viewport.customItem,
    customForm: viewport.customForm,
    customWInput: viewport.customWInput,
    customHInput: viewport.customHInput,
    customApplyBtn: viewport.customApplyBtn,
    inspectBtn: actions.inspectBtn,
    recordBtn: actions.recordBtn,
    drawBtn: actions.drawBtn,
    authBtn: actions.authBtn,
    viewportContainer,
  };
}
