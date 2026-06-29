import {
  type BrowserPageState,
  describeBrowserPageState,
} from './navigation.js';
import { createNewTabStateController } from './new-tab-state.js';
import { createBrowserNewTabUi } from './new-tab-ui.js';
import {
  resolveBrowserPartitionForSession,
} from './pane-helpers.js';
import { syncBrowserTrustZoneBadge } from './trust-zone.js';
import type { WebviewElement } from './types.js';

interface BrowserTabShellArtifactsParams {
  sessionId: string;
  url?: string;
  el: HTMLDivElement;
  viewportContainer: HTMLDivElement;
  statusBadge: HTMLSpanElement;
  trustZoneBadge: HTMLSpanElement;
  chromeHint: HTMLDivElement;
  goBtn: HTMLButtonElement;
  isLocalSurfaceUrl(url: string): boolean;
}

export interface BrowserTabShellArtifacts {
  webview: WebviewElement;
  contentShell: HTMLDivElement;
  newTabPage: HTMLDivElement;
  ntpGrid: HTMLDivElement;
  ntpTargetsText: HTMLDivElement;
  ntpTargetsMeta: HTMLDivElement;
  focusAddressBtn: HTMLButtonElement;
  refreshTargetsBtn: HTMLButtonElement;
  newTabStateController: {
    hideEmptyState(): void;
    showDefaultCopy(): void;
    showOfflineState(value: string): void;
    resetNewTabCopy(): void;
    setLocalTargetsSummary(count: number): void;
    setLocalTargetsMeta(value: string): void;
  };
  syncSurfaceVisibility(showEmptySurface: boolean): void;
  syncBrowserStatus(state: BrowserPageState, currentUrl?: string): void;
}

export function syncBrowserStatusUi(
  statusBadge: HTMLSpanElement,
  trustZoneBadge: HTMLSpanElement,
  chromeHint: HTMLDivElement,
  goBtn: HTMLButtonElement,
  state: BrowserPageState,
  currentUrl?: string,
): void {
  statusBadge.dataset.state = state;
  statusBadge.textContent = describeBrowserPageState(state);
  syncBrowserTrustZoneBadge(trustZoneBadge, currentUrl);
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

export function syncBrowserSurfaceVisibility(
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

export function createBrowserTabShellArtifacts(
  params: BrowserTabShellArtifactsParams,
): BrowserTabShellArtifacts {
  const {
    sessionId,
    url,
    el,
    viewportContainer,
    statusBadge,
    trustZoneBadge,
    chromeHint,
    goBtn,
    isLocalSurfaceUrl,
  } = params;

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

  const syncBrowserStatus = (state: BrowserPageState, currentUrl?: string): void => {
    syncBrowserStatusUi(statusBadge, trustZoneBadge, chromeHint, goBtn, state, currentUrl);
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
    isLocalSurfaceUrl,
  });

  syncSurfaceVisibility(!url || url === 'about:blank');

  const contentShell = document.createElement('div');
  contentShell.className = 'browser-content-shell live-view-surface live-view';
  contentShell.appendChild(viewportContainer);
  contentShell.appendChild(newTabPage);
  el.appendChild(contentShell);

  return {
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
  };
}
