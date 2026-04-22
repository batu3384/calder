import {
  navigateTo,
  type BrowserPageState,
} from './navigation.js';
import { VIEWPORT_PRESETS, type BrowserTabInstance, type WebviewElement } from './types.js';
import { applyViewport } from './viewport.js';
import { addFlowStep } from './flow-recording.js';
import { createBrowserAuthController } from './auth-controller.js';
import { populateLocalTargets } from './local-targets.js';
import {
  syncAddressBarState as syncBrowserAddressBarState,
  syncNavigationControls as syncBrowserNavigationControls,
} from './navigation-chrome.js';
import { resolveCredentialOrigin } from './pane-helpers.js';
import {
  attachBrowserCaptureInteractions,
  attachBrowserNavigationInteractions,
  attachBrowserNewTabTargetingBindings,
  attachBrowserViewportInteractions,
  bindBrowserToolbarState,
  type BrowserCaptureToolbarCluster,
} from './pane-interactions.js';
import type {
  BrowserAuthPanelArtifacts,
  BrowserPaneCaptureArtifacts,
} from './pane-artifacts.js';
import {
  attachBrowserWebviewBindings,
  type BrowserNewTabStateBindings,
} from './pane-runtime.js';

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
  syncBrowserStatus(state: BrowserPageState): void;
  openViewportMenu(reason?: string, focusMode?: ViewportMenuFocusMode): void;
  closeViewportMenu(reason?: string, returnFocus?: boolean): void;
}

export function initializeBrowserTabRuntimeBindings(params: BrowserTabRuntimeInitializationParams): void {
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
