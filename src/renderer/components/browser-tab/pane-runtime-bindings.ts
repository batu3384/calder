import { createBrowserAuthController } from './auth-controller.js';
import { addFlowStep } from './flow-recording.js';
import { populateLocalTargets } from './local-targets.js';
import { type BrowserPageState, navigateTo } from './navigation.js';
import {
  syncAddressBarState as syncBrowserAddressBarState,
  syncNavigationControls as syncBrowserNavigationControls,
} from './navigation-chrome.js';
import type { BrowserAuthPanelArtifacts, BrowserPaneCaptureArtifacts } from './pane-artifacts.js';
import { resolveCredentialOrigin } from './pane-helpers.js';
import {
  attachBrowserCaptureInteractions,
  attachBrowserNavigationInteractions,
  attachBrowserNewTabTargetingBindings,
  attachBrowserViewportInteractions,
  bindBrowserToolbarState,
  type BrowserCaptureToolbarCluster,
} from './pane-interactions.js';
import { attachBrowserWebviewBindings, type BrowserNewTabStateBindings } from './pane-runtime.js';
import { type BrowserTabInstance, VIEWPORT_PRESETS, type WebviewElement } from './types.js';
import { applyViewport } from './viewport.js';

type ViewportMenuFocusMode = 'selected' | 'first' | 'last' | 'none';

export interface BrowserTabRuntimeInitializationParams {
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
  syncBrowserStatus(state: BrowserPageState, currentUrl?: string): void;
  openViewportMenu(reason?: string, focusMode?: ViewportMenuFocusMode): void;
  closeViewportMenu(reason?: string, returnFocus?: boolean): void;
}

function mapAuthElements(artifacts: BrowserAuthPanelArtifacts) {
  return {
    authPanel: artifacts.authPanel,
    authOriginEl: artifacts.authOriginEl,
    authProfileSelect: artifacts.authProfileSelect,
    authLabelInput: artifacts.authLabelInput,
    authUsernameInput: artifacts.authUsernameInput,
    authPasswordInput: artifacts.authPasswordInput,
    authAutoFillCheckbox: artifacts.authAutoFillCheckbox,
    authStatusEl: artifacts.authStatusEl,
    authDeleteBtn: artifacts.authDeleteBtn,
    authSaveBtn: artifacts.authSaveBtn,
    authFillBtn: artifacts.authFillBtn,
    authCloseBtn: artifacts.authCloseBtn,
  };
}

function createSyncNavigationControls(
  instance: BrowserTabInstance,
  backBtn: HTMLButtonElement,
  fwdBtn: HTMLButtonElement,
): () => void {
  return () => {
    syncBrowserNavigationControls({
      instance,
      backBtn,
      fwdBtn,
    });
  };
}

function createSyncAddressBarState(
  instance: BrowserTabInstance,
  urlInput: HTMLInputElement,
  toolbarAddressShell: HTMLDivElement,
  goBtn: HTMLButtonElement,
  reloadBtn: HTMLButtonElement,
): () => void {
  return () => {
    syncBrowserAddressBarState({
      instance,
      urlInput,
      toolbarAddressShell,
      goBtn,
      reloadBtn,
    });
  };
}

function createReloadCurrentPage(
  instance: BrowserTabInstance,
  webview: WebviewElement,
): () => void {
  return () => {
    if (!instance.webviewReady) return;
    webview.reload();
  };
}

function createOpenBrowserHome(
  instance: BrowserTabInstance,
  newTabStateController: BrowserNewTabStateBindings,
  ntpGrid: HTMLDivElement,
  ntpTargetsText: HTMLDivElement,
  ntpTargetsMeta: HTMLDivElement,
): () => void {
  return () => {
    newTabStateController.resetNewTabCopy();
    navigateTo(instance, 'about:blank');
    void populateLocalTargets(instance, ntpGrid, ntpTargetsText, ntpTargetsMeta);
  };
}

function createApplyCustomSize(
  instance: BrowserTabInstance,
  customWInput: HTMLInputElement,
  customHInput: HTMLInputElement,
  closeViewportMenu: BrowserTabRuntimeInitializationParams['closeViewportMenu'],
): () => void {
  return () => {
    const w = parseInt(customWInput.value, 10);
    const h = parseInt(customHInput.value, 10);
    if (w > 0 && h > 0) {
      applyViewport(instance, { label: 'Custom', width: w, height: h });
      closeViewportMenu('custom-apply');
    }
  };
}

function createRecordNavigationStep(instance: BrowserTabInstance): (url: string) => void {
  return (url: string) => {
    const lastStep = instance.flowSteps[instance.flowSteps.length - 1];
    if (lastStep?.type === 'navigate' && lastStep.url === url) return;
    addFlowStep(instance, { type: 'navigate', url });
  };
}

export function initializeBrowserTabRuntimeBindings(
  params: BrowserTabRuntimeInitializationParams,
): void {
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
    authElements: mapAuthElements(authPanelArtifacts),
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

  const syncNavigationControlsImpl = createSyncNavigationControls(instance, backBtn, fwdBtn);
  const syncAddressBarStateImpl = createSyncAddressBarState(
    instance,
    urlInput,
    toolbarAddressShell,
    goBtn,
    reloadBtn,
  );
  const reloadCurrentPageImpl = createReloadCurrentPage(instance, webview);
  const openBrowserHomeImpl = createOpenBrowserHome(
    instance,
    newTabStateController,
    ntpGrid,
    ntpTargetsText,
    ntpTargetsMeta,
  );

  function syncNavigationControls(instance: BrowserTabInstance): void {
    void instance;
    syncNavigationControlsImpl();
  }

  function syncAddressBarState(instance: BrowserTabInstance): void {
    void instance;
    syncAddressBarStateImpl();
  }
  instance.syncAddressBarState = () => syncAddressBarState(instance);

  function reloadCurrentPage(): void {
    reloadCurrentPageImpl();
  }

  function openBrowserHome(): void {
    openBrowserHomeImpl();
  }
  // Contract breadcrumb: toolbarNavShell.appendChild(homeBtn);

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

  const applyCustomSize = createApplyCustomSize(
    instance,
    customWInput,
    customHInput,
    closeViewportMenu,
  );

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

  const recordNavigationStep = createRecordNavigationStep(instance);

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
