import { appState } from '../../state.js';
import { getProviderDisplayName } from '../surface-services/provider-availability.js';
import {
  clearDrawing,
  dismissDraw,
  sendDrawToSelectedSession,
  toggleDrawMode,
} from './draw-mode.js';
import { dismissFlowPicker } from './flow-picker.js';
import { addFlowStep, clearFlow, toggleFlowMode } from './flow-recording.js';
import { sendGuestMessage } from './guest-messaging.js';
import { dismissInspect, toggleInspectMode } from './inspect-mode.js';
import { populateLocalTargets } from './local-targets.js';
import {
  type BrowserPageState,
  navigateTo,
  normalizeUrl,
  resolveBrowserPageState,
} from './navigation.js';
import { resolveCaptureModeState } from './pane-helpers.js';
import { enablePopoverDragging } from './popover.js';
import { sendFlowToSelectedSession, sendToSelectedSession } from './session-integration.js';
import {
  closeBrowserTargetMenu,
  openBrowserTargetMenu,
  syncBrowserTargetControls,
} from './target-menu.js';
import type {
  BrowserTabInstance,
  FlowPickerAction,
  FlowReplayPayload,
  WebviewElement,
} from './types.js';

export type ViewportMenuFocusMode = 'selected' | 'first' | 'last' | 'none';

export interface BrowserViewportInteractionBindingParams {
  instance: BrowserTabInstance;
  viewportWrapper: HTMLDivElement;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  viewportMenuItems: HTMLButtonElement[];
  customForm: HTMLDivElement;
  customItem: HTMLButtonElement;
  customWInput: HTMLInputElement;
  customHInput: HTMLInputElement;
  customApplyBtn: HTMLButtonElement;
  openViewportMenu(reason?: string, focusMode?: ViewportMenuFocusMode): void;
  closeViewportMenu(reason?: string, returnFocus?: boolean): void;
  applyCustomSize(): void;
}

export interface BrowserCaptureInteractionBindingParams {
  instance: BrowserTabInstance;
  inspectBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  drawBtn: HTMLButtonElement;
  drawClearBtn: HTMLButtonElement;
  drawSubmitBtn: HTMLButtonElement;
  drawCustomBtn: HTMLButtonElement;
  drawInstructionInput: HTMLTextAreaElement;
  flowClearBtn: HTMLButtonElement;
  flowSubmitBtn: HTMLButtonElement;
  flowCustomBtn: HTMLButtonElement;
  flowPickerMenu: HTMLDivElement;
  flowPickerOverlay: HTMLDivElement;
  submitBtn: HTMLButtonElement;
  customBtn: HTMLButtonElement;
  instructionInput: HTMLTextAreaElement;
}

export interface BrowserNavigationInteractionBindingParams {
  instance: BrowserTabInstance;
  webview: WebviewElement;
  urlInput: HTMLInputElement;
  backBtn: HTMLButtonElement;
  fwdBtn: HTMLButtonElement;
  reloadBtn: HTMLButtonElement;
  homeBtn: HTMLButtonElement;
  goBtn: HTMLButtonElement;
  syncBrowserStatus(state: BrowserPageState, currentUrl?: string): void;
  syncNavigationControls(): void;
  syncAddressBarState(): void;
  reloadCurrentPage(): void;
  openBrowserHome(): void;
}

export interface BrowserCaptureToolbarCluster {
  element: HTMLDivElement;
  label: HTMLSpanElement;
}

export interface BrowserToolbarStateBindingParams {
  instance: BrowserTabInstance;
  captureCluster: BrowserCaptureToolbarCluster;
  inspectBtn: HTMLButtonElement;
  drawBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
}

export interface BrowserNewTabTargetingBindingParams {
  instance: BrowserTabInstance;
  inspectPanel: HTMLDivElement;
  inspectHandle: HTMLDivElement;
  urlInput: HTMLInputElement;
  focusAddressBtn: HTMLButtonElement;
  refreshTargetsBtn: HTMLButtonElement;
  ntpGrid: HTMLDivElement;
  ntpTargetsText: HTMLDivElement;
  ntpTargetsMeta: HTMLDivElement;
  newTabStateController: {
    resetNewTabCopy(): void;
  };
}

export function attachBrowserViewportInteractions(
  params: BrowserViewportInteractionBindingParams,
): void {
  const {
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
  } = params;

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
      !eventPathContains(e, viewportWrapper) &&
      !eventPathContains(e, viewportBtn) &&
      !eventPathContains(e, viewportDropdown)
    ) {
      closeViewportMenu('outside-press');
    }
  };
  const outsidePressEventName: 'pointerdown' | 'mousedown' =
    typeof window !== 'undefined' && 'PointerEvent' in window ? 'pointerdown' : 'mousedown';
  document.addEventListener(outsidePressEventName, instance.viewportOutsideClickHandler);

  instance.targetMenuOutsideClickHandler = (e: MouseEvent) => {
    if (
      !eventPathContains(e, instance.targetMenu) &&
      !eventPathContains(e, instance.inspectTargetBtn) &&
      !eventPathContains(e, instance.drawTargetBtn) &&
      !eventPathContains(e, instance.flowTargetBtn)
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

  function focusViewportMenuItem(index: number): void {
    if (viewportMenuItems.length === 0) return;
    const normalized =
      ((index % viewportMenuItems.length) + viewportMenuItems.length) % viewportMenuItems.length;
    viewportMenuItems.forEach((item) => {
      item.tabIndex = -1;
    });
    const nextItem = viewportMenuItems[normalized];
    nextItem.tabIndex = 0;
    nextItem.focus();
  }
}

export function attachBrowserCaptureInteractions(
  params: BrowserCaptureInteractionBindingParams,
): void {
  const {
    instance,
    inspectBtn,
    recordBtn,
    drawBtn,
    drawClearBtn,
    drawSubmitBtn,
    drawCustomBtn,
    drawInstructionInput,
    flowClearBtn,
    flowSubmitBtn,
    flowCustomBtn,
    flowPickerMenu,
    flowPickerOverlay,
    submitBtn,
    customBtn,
    instructionInput,
  } = params;

  inspectBtn.addEventListener('click', () => toggleInspectMode(instance));
  recordBtn.addEventListener('click', () => toggleFlowMode(instance));
  drawBtn.addEventListener('click', () => toggleDrawMode(instance));
  drawClearBtn.addEventListener('click', () => clearDrawing(instance));
  drawSubmitBtn.addEventListener('click', () => {
    void sendDrawToSelectedSession(instance);
  });
  drawCustomBtn.addEventListener('click', () =>
    openBrowserTargetMenu(instance, drawCustomBtn, 'draw'),
  );
  drawInstructionInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendDrawToSelectedSession(instance);
    } else if (e.key === 'Escape') {
      dismissDraw(instance);
    }
  });
  flowClearBtn.addEventListener('click', () => clearFlow(instance));
  flowSubmitBtn.addEventListener('click', () => {
    void sendFlowToSelectedSession(instance);
  });
  flowCustomBtn.addEventListener('click', () =>
    openBrowserTargetMenu(instance, flowCustomBtn, 'flow'),
  );

  flowPickerMenu.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('.flow-picker-item');
    if (!item || !instance.flowPickerPending) return;
    const action = item.dataset['action'] as FlowPickerAction;
    const metadata = instance.flowPickerPending;
    dismissFlowPicker(instance);
    if (action === 'click' || action === 'click-and-record') {
      const selectorValues = metadata.selectorValues?.length
        ? metadata.selectorValues
        : metadata.selectors
            .map((selector) => selector.value)
            .filter((value) => value.trim().length > 0);
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

  submitBtn.addEventListener('click', () => {
    void sendToSelectedSession(instance);
  });
  customBtn.addEventListener('click', () => openBrowserTargetMenu(instance, customBtn, 'inspect'));
  instructionInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendToSelectedSession(instance);
    } else if (e.key === 'Escape') dismissInspect(instance);
  });
}

export function attachBrowserNavigationInteractions(
  params: BrowserNavigationInteractionBindingParams,
): void {
  const {
    instance,
    webview,
    urlInput,
    backBtn,
    fwdBtn,
    reloadBtn,
    homeBtn,
    goBtn,
    syncBrowserStatus,
    syncNavigationControls,
    syncAddressBarState,
    reloadCurrentPage,
    openBrowserHome,
  } = params;

  backBtn.addEventListener('click', () => webview.goBack());
  fwdBtn.addEventListener('click', () => webview.goForward());
  reloadBtn.addEventListener('click', () => reloadCurrentPage());
  homeBtn.addEventListener('click', () => openBrowserHome());

  goBtn.addEventListener('click', () => {
    if (instance.isLoading) {
      try {
        webview.stop();
      } catch {
        /* webview may already be stopped */
      }
      instance.isLoading = false;
      syncBrowserStatus(
        resolveBrowserPageState(urlInput.value.trim(), false, false),
        urlInput.value.trim(),
      );
      syncNavigationControls();
      syncAddressBarState();
      return;
    }

    const normalizedDraft = normalizeUrl(urlInput.value);
    if (
      normalizedDraft &&
      normalizedDraft === instance.committedUrl &&
      instance.committedUrl !== 'about:blank'
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
    syncAddressBarState();
  });
  urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      navigateTo(instance, urlInput.value);
      webview.focus();
    }
    if (e.key === 'Escape') {
      urlInput.value = instance.committedUrl || webview.src || urlInput.value;
      urlInput.blur();
      syncAddressBarState();
      webview.focus();
    }
  });
}

export function bindBrowserToolbarState(params: BrowserToolbarStateBindingParams): void {
  const { instance, captureCluster, inspectBtn, drawBtn, recordBtn } = params;

  instance.syncToolbarState = () => {
    const mode = resolveCaptureModeState(instance);
    const modeText =
      mode === 'inspect'
        ? 'Inspecting'
        : mode === 'draw'
          ? 'Drawing'
          : mode === 'flow'
            ? 'Recording'
            : 'Idle';
    captureCluster.label.textContent = 'Capture';
    captureCluster.element.dataset.captureMode = mode;

    const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
    captureCluster.label.title = selectedTarget
      ? `Mode: ${modeText} · Target: ${getProviderDisplayName(selectedTarget.providerId ?? 'claude')} / ${selectedTarget.name}`
      : `Mode: ${modeText} · Target: none`;

    inspectBtn.textContent = instance.inspectMode ? 'Inspecting' : 'Inspect';
    inspectBtn.dataset.state = instance.inspectMode ? 'active' : 'idle';
    inspectBtn.title = instance.inspectMode ? 'Inspect mode is active' : 'Inspect element';
    inspectBtn.ariaLabel = inspectBtn.title;

    drawBtn.textContent = instance.drawMode ? 'Drawing' : 'Draw';
    drawBtn.dataset.state = instance.drawMode ? 'active' : 'idle';
    drawBtn.title = instance.drawMode
      ? 'Draw mode is active'
      : 'Draw on page and send annotated screenshot to AI';
    drawBtn.ariaLabel = drawBtn.title;

    recordBtn.textContent = instance.flowMode ? 'Recording' : 'Record';
    recordBtn.dataset.state = instance.flowMode ? 'active' : 'idle';
    recordBtn.title = instance.flowMode ? 'Flow recording is active' : 'Record browser flow';
    recordBtn.ariaLabel = recordBtn.title;
  };
}

export function attachBrowserNewTabTargetingBindings(
  params: BrowserNewTabTargetingBindingParams,
): void {
  const {
    instance,
    inspectPanel,
    inspectHandle,
    urlInput,
    focusAddressBtn,
    refreshTargetsBtn,
    ntpGrid,
    ntpTargetsText,
    ntpTargetsMeta,
    newTabStateController,
  } = params;

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
}
