import { appState } from '../../state.js';
import { shortcutManager } from '../../shortcuts.js';
import {
  VIEWPORT_PRESETS,
  type BrowserTabInstance,
  type ElementInfo,
  type FlowPickerMetadata,
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
import { applyViewport, openViewportDropdown, closeViewportDropdown } from './viewport.js';
import { showElementInfo } from './inspect-mode.js';
import {
  positionDrawPopover,
} from './draw-mode.js';
import { addFlowStep } from './flow-recording.js';
import { showFlowPicker } from './flow-picker.js';
import { sendGuestMessage } from './guest-messaging.js';
import type {
  BrowserGuestOpenPayload,
} from '../../../shared/types/project.js';
import { handleBrowserGuestOpenRequest } from './popup-routing.js';
import { createBrowserAuthController } from './auth-controller.js';
import { populateLocalTargets } from './local-targets.js';
import {
  closeBrowserTargetMenu,
} from './target-menu.js';
import { createNewTabStateController } from './new-tab-state.js';
import {
  syncAddressBarState as syncBrowserAddressBarState,
  syncNavigationControls as syncBrowserNavigationControls,
} from './navigation-chrome.js';
import { createBrowserNewTabUi } from './new-tab-ui.js';
import {
  resolveBrowserPartitionForSession,
  resolveCredentialOrigin,
  syncBrowserTabToSessionState,
} from './pane-helpers.js';
import { createBrowserTabPaneLayout } from './pane-layout.js';
import {
  attachBrowserCaptureInteractions,
  attachBrowserNavigationInteractions,
  attachBrowserNewTabTargetingBindings,
  attachBrowserViewportInteractions,
  bindBrowserToolbarState,
  type BrowserCaptureToolbarCluster,
  type ViewportMenuFocusMode,
} from './pane-interactions.js';
import {
  createBrowserAuthPanelArtifacts,
  createBrowserPaneCaptureArtifacts,
  type BrowserAuthPanelArtifacts,
  type BrowserPaneCaptureArtifacts,
} from './pane-artifacts.js';

export function createBrowserTabPane(sessionId: string, url?: string): void {
  initializeBrowserTabPane(sessionId, url);
}

interface BrowserNewTabStateBindings {
  resetNewTabCopy(): void;
  showOfflineState(failedUrl: string): void;
}

interface BrowserAuthControllerBindings {
  maybeAutoFillCredentials(): Promise<void>;
  setStatus(message: string, tone: 'default' | 'success' | 'error'): void;
  refreshProfilesIfPanelOpen(): void;
  syncActionsEnabledState(): void;
  handleFillResult(payload: { filledUsername?: boolean; filledPassword?: boolean }): void;
}

interface BrowserWebviewBindingParams {
  sessionId: string;
  url?: string;
  instance: BrowserTabInstance;
  webview: WebviewElement;
  urlInput: HTMLInputElement;
  newTabPage: HTMLElement;
  newTabStateController: BrowserNewTabStateBindings;
  authController: BrowserAuthControllerBindings;
  syncSurfaceVisibility(showEmptySurface: boolean): void;
  syncBrowserStatus(state: BrowserPageState): void;
  syncNavigationControls(): void;
  syncAddressBarState(): void;
  reloadCurrentPage(): void;
  recordNavigationStep(url: string): void;
}

interface BrowserInstanceCreationParams {
  sessionId: string;
  url?: string;
  el: HTMLDivElement;
  webview: WebviewElement;
  statusBadge: HTMLSpanElement;
  chromeHint: HTMLDivElement;
  contentShell: HTMLDivElement;
  viewportContainer: HTMLDivElement;
  newTabPage: HTMLDivElement;
  urlInput: HTMLInputElement;
  goBtn: HTMLButtonElement;
  inspectBtn: HTMLButtonElement;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  recordBtn: HTMLButtonElement;
  drawBtn: HTMLButtonElement;
  capture: BrowserPaneCaptureArtifacts;
}

interface BrowserTabRuntimeInitializationParams {
  instance: BrowserTabInstance;
  sessionId: string;
  url?: string;
  webview: WebviewElement;
  urlInput: HTMLInputElement;
  newTabPage: HTMLDivElement;
  goBtn: HTMLButtonElement;
  reloadBtn: HTMLButtonElement;
  homeBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  fwdBtn: HTMLButtonElement;
  inspectBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  drawBtn: HTMLButtonElement;
  captureCluster: BrowserCaptureToolbarCluster;
  toolbarAddressShell: HTMLDivElement;
  authBtn: HTMLButtonElement;
  authPanelArtifacts: BrowserAuthPanelArtifacts;
  capture: BrowserPaneCaptureArtifacts;
  focusAddressBtn: HTMLButtonElement;
  refreshTargetsBtn: HTMLButtonElement;
  ntpGrid: HTMLDivElement;
  ntpTargetsText: HTMLDivElement;
  ntpTargetsMeta: HTMLDivElement;
  newTabStateController: BrowserNewTabStateBindings;
  viewportWrapper: HTMLDivElement;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  viewportMenuItems: HTMLButtonElement[];
  customForm: HTMLDivElement;
  customItem: HTMLButtonElement;
  customWInput: HTMLInputElement;
  customHInput: HTMLInputElement;
  customApplyBtn: HTMLButtonElement;
  syncSurfaceVisibility(showEmptySurface: boolean): void;
  syncBrowserStatus(state: BrowserPageState): void;
  openViewportMenu(reason?: string, focusMode?: ViewportMenuFocusMode): void;
  closeViewportMenu(reason?: string, returnFocus?: boolean): void;
}

function createBrowserTabInstance(params: BrowserInstanceCreationParams): BrowserTabInstance {
  const {
    sessionId,
    url,
    el,
    webview,
    statusBadge,
    chromeHint,
    contentShell,
    viewportContainer,
    newTabPage,
    urlInput,
    goBtn,
    inspectBtn,
    viewportBtn,
    viewportDropdown,
    recordBtn,
    drawBtn,
    capture,
  } = params;

  return {
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
    inspectPanel: capture.inspectPanel,
    inspectTitleEl: capture.inspectTitle,
    inspectSubtitleEl: capture.inspectSubtitle,
    instructionInput: capture.instructionInput,
    submitBtn: capture.submitBtn,
    inspectTargetBtn: capture.customBtn,
    inspectAttachDimsCheckbox: capture.inspectAttachDimsCheckbox,
    inspectErrorEl: capture.inspectErrorEl,
    inspectContextTraceEl: capture.inspectContextTraceEl,
    elementInfoEl: capture.elementInfoEl,
    inspectMode: false,
    selectedElement: null,
    currentViewport: VIEWPORT_PRESETS[0],
    isLoading: false,
    viewportOutsideClickHandler: () => {},
    viewportDropdownFloatingCleanup: null,
    recordBtn,
    flowPanel: capture.flowPanel,
    flowPanelLabel: capture.flowLabel,
    flowStepsList: capture.flowStepsList,
    flowInputRow: capture.flowInputRow,
    flowInstructionInput: capture.flowInstructionInput,
    flowSubmitBtn: capture.flowSubmitBtn,
    flowTargetBtn: capture.flowCustomBtn,
    flowErrorEl: capture.flowErrorEl,
    flowContextTraceEl: capture.flowContextTraceEl,
    flowMode: false,
    flowSteps: [],
    flowPickerOverlay: capture.flowPickerOverlay,
    flowPickerMenu: capture.flowPickerMenu,
    flowPickerPending: null,
    drawBtn,
    drawPanel: capture.drawPanel,
    drawInstructionInput: capture.drawInstructionInput,
    drawSubmitBtn: capture.drawSubmitBtn,
    drawTargetBtn: capture.drawCustomBtn,
    drawAttachDimsCheckbox: capture.drawAttachDimsCheckbox,
    drawErrorEl: capture.drawErrorEl,
    drawContextTraceEl: capture.drawContextTraceEl,
    drawMode: false,
    targetMenu: capture.targetMenu,
    targetMenuList: capture.targetMenuList,
    targetMenuOutsideClickHandler: () => {},
    targetMenuFloatingCleanup: null,
    activeTargetTrigger: null,
    activeTargetMode: null,
    syncSurfaceVisibility: () => {},
    syncAddressBarState: () => {},
    syncToolbarState: () => {},
    cleanupFns: [],
  };
}

function attachBrowserWebviewBindings(params: BrowserWebviewBindingParams): void {
  const {
    sessionId,
    url,
    instance,
    webview,
    urlInput,
    newTabPage,
    newTabStateController,
    authController,
    syncSurfaceVisibility,
    syncBrowserStatus,
    syncNavigationControls,
    syncAddressBarState,
    reloadCurrentPage,
    recordNavigationStep,
  } = params;

  webview.addEventListener('before-input-event', ((e: CustomEvent & {
    preventDefault(): void;
    input: { type: string; key: string; shift: boolean; control: boolean; alt: boolean; meta: boolean };
  }) => {
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
      instance.viewportContainer.appendChild(webview);
    });

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
    syncNavigationControls();
    syncAddressBarState();
    appState.updateSessionBrowserTabUrl(sessionId, url);
    clearPendingNavigation(instance);
    if (instance.flowMode) recordNavigationStep(url);
    authController.refreshProfilesIfPanelOpen();
  }

  webview.addEventListener('did-start-loading', (() => {
    instance.isLoading = true;
    syncBrowserStatus(resolveBrowserPageState(urlInput.value.trim(), true, false));
    syncNavigationControls();
    syncAddressBarState();
  }) as EventListener);

  webview.addEventListener('dom-ready', (() => {
    instance.webviewReady = true;
    if (instance.inspectMode) void sendGuestMessage(instance.webview, 'enter-inspect-mode');
    if (instance.flowMode) void sendGuestMessage(instance.webview, 'enter-flow-mode');
    if (instance.drawMode) void sendGuestMessage(instance.webview, 'enter-draw-mode');
    void authController.maybeAutoFillCredentials().catch((error) => {
      authController.setStatus(error instanceof Error ? error.message : 'Auto-fill failed.', 'error');
    });
    syncNavigationControls();
    syncAddressBarState();
  }) as EventListener);

  webview.addEventListener('did-stop-loading', (() => {
    instance.isLoading = false;
    syncBrowserStatus(resolveBrowserPageState(urlInput.value.trim(), false, false));
    syncNavigationControls();
    syncAddressBarState();
  }) as EventListener);

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
    syncNavigationControls();
    syncAddressBarState();
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
  syncNavigationControls();
  syncAddressBarState();
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

function initializeBrowserTabRuntimeBindings(params: BrowserTabRuntimeInitializationParams): void {
  const {
    instance,
    sessionId,
    url,
    webview,
    urlInput,
    newTabPage,
    goBtn,
    reloadBtn,
    homeBtn,
    backBtn,
    fwdBtn,
    inspectBtn,
    recordBtn,
    drawBtn,
    captureCluster,
    toolbarAddressShell,
    authBtn,
    authPanelArtifacts,
    capture,
    focusAddressBtn,
    refreshTargetsBtn,
    ntpGrid,
    ntpTargetsText,
    ntpTargetsMeta,
    newTabStateController,
    viewportWrapper,
    viewportBtn,
    viewportDropdown,
    viewportMenuItems,
    customForm,
    customItem,
    customWInput,
    customHInput,
    customApplyBtn,
    syncSurfaceVisibility,
    syncBrowserStatus,
    openViewportMenu,
    closeViewportMenu,
  } = params;

  applyViewport(instance, VIEWPORT_PRESETS[0]);
  instance.syncSurfaceVisibility = syncSurfaceVisibility;
  bindBrowserToolbarState({
    instance,
    captureCluster,
    inspectBtn,
    drawBtn,
    recordBtn,
  });
  const authController = createBrowserAuthController({
    instance,
    authBtn,
    authElements: {
      authPanel: authPanelArtifacts.authPanel,
      authOriginEl: authPanelArtifacts.authOriginEl,
      authProfileSelect: authPanelArtifacts.authProfileSelect,
      authLabelInput: authPanelArtifacts.authLabelInput,
      authUsernameInput: authPanelArtifacts.authUsernameInput,
      authPasswordInput: authPanelArtifacts.authPasswordInput,
      authAutoFillCheckbox: authPanelArtifacts.authAutoFillCheckbox,
      authStatusEl: authPanelArtifacts.authStatusEl,
      authDeleteBtn: authPanelArtifacts.authDeleteBtn,
      authSaveBtn: authPanelArtifacts.authSaveBtn,
      authFillBtn: authPanelArtifacts.authFillBtn,
      authCloseBtn: authPanelArtifacts.authCloseBtn,
    },
    getUrlInputValue: () => urlInput.value,
    getWebviewSrc: () => webview.src,
    resolveCredentialOrigin,
  });
  instance.cleanupFns.push(() => authController.cleanup());

  attachBrowserNewTabTargetingBindings({
    instance,
    inspectPanel: capture.inspectPanel,
    inspectHandle: capture.inspectHandle,
    urlInput,
    focusAddressBtn,
    refreshTargetsBtn,
    ntpGrid,
    ntpTargetsText,
    ntpTargetsMeta,
    newTabStateController,
  });

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

  attachBrowserNavigationInteractions({
    instance,
    webview,
    urlInput,
    backBtn,
    fwdBtn,
    reloadBtn,
    homeBtn,
    goBtn,
    syncBrowserStatus,
    syncNavigationControls: () => syncNavigationControls(instance),
    syncAddressBarState: () => syncAddressBarState(instance),
    reloadCurrentPage,
    openBrowserHome,
  });

  function applyCustomSize(): void {
    const w = parseInt(customWInput.value, 10);
    const h = parseInt(customHInput.value, 10);
    if (w > 0 && h > 0) {
      applyViewport(instance, { label: 'Custom', width: w, height: h });
      closeViewportMenu('custom-apply');
    }
  }

  attachBrowserViewportInteractions({
    instance,
    viewportWrapper,
    viewportBtn,
    viewportDropdown,
    viewportMenuItems,
    customForm,
    customItem,
    customWInput,
    customHInput,
    customApplyBtn,
    openViewportMenu,
    closeViewportMenu,
    applyCustomSize,
  });

  attachBrowserCaptureInteractions({
    instance,
    inspectBtn,
    recordBtn,
    drawBtn,
    drawClearBtn: capture.drawClearBtn,
    drawSubmitBtn: capture.drawSubmitBtn,
    drawCustomBtn: capture.drawCustomBtn,
    drawInstructionInput: capture.drawInstructionInput,
    flowClearBtn: capture.flowClearBtn,
    flowSubmitBtn: capture.flowSubmitBtn,
    flowCustomBtn: capture.flowCustomBtn,
    flowPickerMenu: capture.flowPickerMenu,
    flowPickerOverlay: capture.flowPickerOverlay,
    submitBtn: capture.submitBtn,
    customBtn: capture.customBtn,
    instructionInput: capture.instructionInput,
  });

  function recordNavigationStep(url: string): void {
    const lastStep = instance.flowSteps[instance.flowSteps.length - 1];
    if (lastStep?.type === 'navigate' && lastStep.url === url) return;
    addFlowStep(instance, { type: 'navigate', url });
  }

  attachBrowserWebviewBindings({
    sessionId,
    url,
    instance,
    webview,
    urlInput,
    newTabPage,
    newTabStateController,
    authController,
    syncSurfaceVisibility,
    syncBrowserStatus,
    syncNavigationControls: () => syncNavigationControls(instance),
    syncAddressBarState: () => syncAddressBarState(instance),
    reloadCurrentPage,
    recordNavigationStep,
  });
}

function syncBrowserStatusUi(
  statusBadge: HTMLSpanElement,
  chromeHint: HTMLDivElement,
  goBtn: HTMLButtonElement,
  state: BrowserPageState,
): void {
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

function syncBrowserSurfaceVisibility(
  newTabPage: HTMLDivElement,
  webview: WebviewElement,
  showEmptySurface: boolean,
): void {
  newTabPage.style.display = showEmptySurface ? 'flex' : 'none';
  newTabPage.setAttribute('aria-hidden', showEmptySurface ? 'false' : 'true');
  webview.dataset.surface = showEmptySurface ? 'hidden' : 'live';
  webview.hidden = showEmptySurface;
  webview.setAttribute('aria-hidden', showEmptySurface ? 'true' : 'false');
}

function initializeBrowserTabPane(sessionId: string, url?: string): void {
  if (instances.has(sessionId)) return;

  const {
    el,
    chromeHint,
    statusBadge,
    toolbarAddressShell,
    captureCluster,
    backBtn,
    fwdBtn,
    reloadBtn,
    homeBtn,
    urlInput,
    goBtn,
    viewportWrapper,
    viewportBtn,
    viewportDropdown,
    customItem,
    customForm,
    customWInput,
    customHInput,
    customApplyBtn,
    inspectBtn,
    recordBtn,
    drawBtn,
    authBtn,
    viewportContainer,
  } = createBrowserTabPaneLayout(sessionId, url);

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
    focusMode: ViewportMenuFocusMode = 'selected',
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
  customItem.tabIndex = -1;
  viewportMenuItems.push(customItem);
  viewportDropdown.appendChild(customItem);
  viewportDropdown.appendChild(customForm);

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

  const syncBrowserStatus = (state: BrowserPageState): void => {
    syncBrowserStatusUi(statusBadge, chromeHint, goBtn, state);
  };

  const webview = document.createElement('webview') as unknown as WebviewElement;
  webview.className = 'browser-webview';
  webview.setAttribute('partition', resolveBrowserPartitionForSession(sessionId));

  const syncSurfaceVisibility = (showEmptySurface: boolean): void => {
    syncBrowserSurfaceVisibility(newTabPage, webview, showEmptySurface);
  };

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

  const capture = createBrowserPaneCaptureArtifacts(el);
  const authPanelArtifacts = createBrowserAuthPanelArtifacts(el);

  const instance: BrowserTabInstance = createBrowserTabInstance({
    sessionId,
    url,
    el,
    webview,
    statusBadge,
    chromeHint,
    contentShell,
    viewportContainer,
    newTabPage,
    urlInput,
    goBtn,
    inspectBtn,
    viewportBtn,
    viewportDropdown,
    recordBtn,
    drawBtn,
    capture,
  });
  instances.set(sessionId, instance);
  initializeBrowserTabRuntimeBindings({
    instance,
    sessionId,
    url,
    webview,
    urlInput,
    newTabPage,
    goBtn,
    reloadBtn,
    homeBtn,
    backBtn,
    fwdBtn,
    inspectBtn,
    recordBtn,
    drawBtn,
    captureCluster,
    toolbarAddressShell,
    authBtn,
    authPanelArtifacts,
    capture,
    focusAddressBtn,
    refreshTargetsBtn,
    ntpGrid,
    ntpTargetsText,
    ntpTargetsMeta,
    newTabStateController,
    viewportWrapper,
    viewportBtn,
    viewportDropdown,
    viewportMenuItems,
    customForm,
    customItem,
    customWInput,
    customHInput,
    customApplyBtn,
    syncSurfaceVisibility,
    syncBrowserStatus,
    openViewportMenu,
    closeViewportMenu,
  });
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
