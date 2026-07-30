import { buildBrowserSessionPartition } from '../../../shared/constants.js';
import { appState } from '../../state.js';
import {
  canonicalizeNavigationUrl,
  clearPendingNavigation,
  isStaleNavigationRevert,
  navigateTo,
  normalizeUrl,
} from './navigation.js';
import type { BrowserTabInstance } from './types.js';

export function createBrowserToolbarCluster(labelText: string): {
  element: HTMLDivElement;
  label: HTMLSpanElement;
  controls: HTMLDivElement;
} {
  const element = document.createElement('div');
  element.className = 'browser-toolbar-cluster';

  const label = document.createElement('span');
  label.className = 'browser-toolbar-cluster-label';
  label.textContent = labelText;
  element.appendChild(label);

  const controls = document.createElement('div');
  controls.className = 'browser-toolbar-cluster-controls';
  element.appendChild(controls);

  return { element, label, controls };
}

export function resolveBrowserPartitionForSession(sessionId: string): string {
  const owningProject = appState.projects.find((project) =>
    project.sessions.some((session) => session.id === sessionId),
  );
  return buildBrowserSessionPartition(owningProject?.id);
}

export function resolveCredentialOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveCaptureModeState(
  instance: BrowserTabInstance,
): 'inspect' | 'draw' | 'flow' | 'idle' {
  if (instance.inspectMode) return 'inspect';
  if (instance.drawMode) return 'draw';
  if (instance.flowMode || instance.flowSteps.length > 0) return 'flow';
  return 'idle';
}

export function syncBrowserTabToSessionState(instance: BrowserTabInstance): void {
  const project = appState.projects.find((entry) =>
    entry.sessions.some((session) => session.id === instance.sessionId),
  );
  const session = project?.sessions.find(
    (entry) => entry.id === instance.sessionId && entry.type === 'browser-tab',
  );
  if (!session) return;

  const storedUrl = normalizeUrl(session.browserTabUrl ?? 'about:blank');
  const liveUrl = instance.webviewReady
    ? normalizeUrl(
        instance.committedUrl || instance.webview.getAttribute('src') || instance.webview.src || '',
      )
    : '';
  const nextUrl =
    liveUrl && liveUrl !== 'about:blank' ? liveUrl : storedUrl;
  const currentUrl = normalizeUrl(
    instance.committedUrl ||
      instance.webview.getAttribute('src') ||
      instance.webview.src ||
      storedUrl ||
      'about:blank',
  );

  if (isStaleNavigationRevert(instance, nextUrl)) {
    return;
  }

  const canonicalNext = canonicalizeNavigationUrl(nextUrl);
  const canonicalCurrent = canonicalizeNavigationUrl(currentUrl);
  const isEmptySurface = canonicalNext === '' || canonicalNext === 'about:blank';

  if (canonicalNext === canonicalCurrent) {
    instance.committedUrl = nextUrl;
    instance.urlInput.value = nextUrl;
    instance.newTabPage.dataset.mode = isEmptySurface ? 'default' : 'hidden';
    instance.syncSurfaceVisibility(isEmptySurface);
    instance.syncAddressBarState();
    clearPendingNavigation(instance);
    return;
  }

  navigateTo(instance, nextUrl);
}
