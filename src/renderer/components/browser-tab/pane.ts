import {
  type BrowserTabInstance,
} from './types.js';
import { instances } from './instance.js';
import {
  isLocalBrowserUrl,
} from './navigation.js';
import { sendGuestMessage } from './guest-messaging.js';
import {
  closeBrowserTargetMenu,
} from './target-menu.js';
import {
  syncBrowserTabToSessionState,
} from './pane-helpers.js';
import { createBrowserTabPaneLayout } from './pane-layout.js';
import {
  createBrowserAuthPanelArtifacts,
  createBrowserPaneCaptureArtifacts,
} from './pane-artifacts.js';
import {
  createBrowserTabInstance,
} from './pane-runtime.js';
import { createBrowserViewportMenuController } from './pane-viewport-menu.js';
import { createBrowserTabShellArtifacts } from './pane-shell.js';
import { initializeBrowserTabRuntimeBindings } from './pane-runtime-bindings.js';

export function createBrowserTabPane(sessionId: string, url?: string): void {
  initializeBrowserTabPane(sessionId, url);
}

function initializeBrowserTabPane(sessionId: string, url?: string): void {
  if (instances.has(sessionId)) return;

  const {
    el,
    chromeHint,
    statusBadge,
    trustZoneBadge,
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
  const {
    webview,
    contentShell,
    newTabPage,
    ntpGrid,
    ntpTargetsText,
    ntpTargetsMeta,
    focusAddressBtn,
    refreshTargetsBtn,
    newTabStateController,
    syncSurfaceVisibility,
    syncBrowserStatus,
  } = createBrowserTabShellArtifacts({
    sessionId,
    url,
    el,
    viewportContainer,
    statusBadge,
    trustZoneBadge,
    chromeHint,
    goBtn,
    isLocalSurfaceUrl: isLocalBrowserUrl,
  });

  const capture = createBrowserPaneCaptureArtifacts(el);
  const authPanelArtifacts = createBrowserAuthPanelArtifacts(el);

  const instance: BrowserTabInstance = createBrowserTabInstance({
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
  });
  instances.set(sessionId, instance);
  const viewportMenuController = createBrowserViewportMenuController({
    instance,
    viewportBtn,
    viewportDropdown,
    customItem,
    customForm,
  });
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
    viewportMenuItems: viewportMenuController.viewportMenuItems,
    customForm,
    customItem,
    customWInput,
    customHInput,
    customApplyBtn,
    syncSurfaceVisibility,
    syncBrowserStatus,
    openViewportMenu: viewportMenuController.openViewportMenu,
    closeViewportMenu: viewportMenuController.closeViewportMenu,
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
