import type { BrowserGuestOpenPayload } from '../../../shared/types/project-core.js';
import { appState } from '../../state.js';
import { shortcutManager } from '../surface-services/shortcuts.js';
import { positionDrawPopover } from './draw-mode.js';
import { showFlowPicker } from './flow-picker.js';
import { sendGuestMessage } from './guest-messaging.js';
import { showElementInfo } from './inspect-mode.js';
import { getPreloadPath } from './instance.js';
import {
  type BrowserPageState,
  clearPendingNavigation,
  isLocalBrowserUrl,
  isStaleNavigationRevert,
  normalizeUrl,
  resolveBrowserPageState,
} from './navigation.js';
import type { BrowserPaneCaptureArtifacts } from './pane-artifacts.js';
import { handleBrowserGuestOpenRequest } from './popup-routing.js';
import {
  type BrowserTabInstance,
  type ElementInfo,
  type FlowPickerMetadata,
  VIEWPORT_PRESETS,
  type WebviewElement,
} from './types.js';

export interface BrowserNewTabStateBindings {
  resetNewTabCopy(): void;
  showOfflineState(failedUrl: string): void;
}

export interface BrowserAuthControllerBindings {
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
  syncBrowserStatus(state: BrowserPageState, currentUrl?: string): void;
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
  trustZoneBadge: HTMLSpanElement;
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

export function createBrowserTabInstance(params: BrowserInstanceCreationParams): BrowserTabInstance {
  const {
    sessionId,
    url,
    el,
    webview,
    statusBadge,
    trustZoneBadge,
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
    trustZoneBadge,
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

export function attachBrowserWebviewBindings(params: BrowserWebviewBindingParams): void {
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
    syncBrowserStatus(resolveBrowserPageState(url, instance.isLoading, false), url);
    syncNavigationControls();
    syncAddressBarState();
    appState.updateSessionBrowserTabUrl(sessionId, url);
    clearPendingNavigation(instance);
    if (instance.flowMode) recordNavigationStep(url);
    authController.refreshProfilesIfPanelOpen();
  }

  webview.addEventListener('did-start-loading', (() => {
    instance.isLoading = true;
    const loadingUrl = instance.committedUrl || urlInput.value.trim();
    syncBrowserStatus(resolveBrowserPageState(loadingUrl, true, false), loadingUrl);
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
    const currentUrl = instance.committedUrl || urlInput.value.trim();
    syncBrowserStatus(resolveBrowserPageState(currentUrl, false, false), currentUrl);
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
    syncBrowserStatus(resolveBrowserPageState(failedUrl, false, true), failedUrl);
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
      try { webview.stop(); } catch { /* webview may already be stopped */ }
    }
    clearPendingNavigation(instance);
  }) as EventListener);

  const initialUrl = instance.committedUrl || urlInput.value.trim();
  syncBrowserStatus(resolveBrowserPageState(initialUrl, false, false), initialUrl);
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
