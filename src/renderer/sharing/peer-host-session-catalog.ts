import { SerializeAddon } from '@xterm/addon-serialize';

import { getBrowserTabInstance } from '../components/browser-tab/instance.js';
import { getTerminalInstance } from '../components/terminal-pane.js';
import { appState } from '../state.js';

interface HostPeerCatalogState {
  ownerSessionId: string;
  activeSessionId: string;
  serializeAddon: SerializeAddon;
}

export interface SessionSnapshot {
  sessionId: string;
  sessionName: string;
  scrollback: string;
  cols: number;
  rows: number;
}

export interface BrowserSessionSnapshot {
  id: string;
  name: string;
  url: string;
  inspectMode: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportLabel: string;
  selectedElementSummary?: string;
}

function isShareableCliSession(sessionType?: string): boolean {
  return !sessionType || sessionType === 'claude';
}

function isShareableBrowserSession(sessionType?: string): boolean {
  return sessionType === 'browser-tab';
}

export function findProjectForShare(ownerSessionId: string) {
  return appState.projects.find((project) => project.sessions.some((session) => session.id === ownerSessionId));
}

export function getSessionSnapshot(hostPeer: HostPeerCatalogState, sessionId: string): SessionSnapshot | null {
  const instance = getTerminalInstance(sessionId);
  if (!instance) return null;

  let scrollback = '';
  if (sessionId === hostPeer.ownerSessionId) {
    scrollback = hostPeer.serializeAddon.serialize();
  } else {
    const addon = new SerializeAddon();
    instance.terminal.loadAddon(addon);
    scrollback = addon.serialize();
    addon.dispose();
  }

  return {
    sessionId,
    sessionName: instance.sessionId,
    scrollback,
    cols: instance.terminal.cols,
    rows: instance.terminal.rows,
  };
}

export function buildSessionCatalog(hostPeer: HostPeerCatalogState): {
  activeSessionId: string;
  sessions: Array<{ id: string; name: string }>;
} {
  const project = findProjectForShare(hostPeer.ownerSessionId);
  if (!project) {
    const fallback = getSessionSnapshot(hostPeer, hostPeer.activeSessionId);
    if (!fallback) {
      return { activeSessionId: hostPeer.activeSessionId, sessions: [] };
    }
    return {
      activeSessionId: fallback.sessionId,
      sessions: [{ id: fallback.sessionId, name: fallback.sessionName }],
    };
  }

  const sessions = project.sessions
    .filter((session) => isShareableCliSession(session.type))
    .filter((session) => Boolean(getTerminalInstance(session.id)))
    .map((session) => ({ id: session.id, name: session.name }));

  if (!sessions.some((session) => session.id === hostPeer.activeSessionId) && sessions.length > 0) {
    hostPeer.activeSessionId = sessions[0].id;
  }

  return {
    activeSessionId: hostPeer.activeSessionId,
    sessions,
  };
}

export function buildBrowserSessionCatalog(ownerSessionId: string): {
  activeBrowserSessionId: string;
  sessions: BrowserSessionSnapshot[];
} {
  const project = findProjectForShare(ownerSessionId);
  if (!project) {
    return {
      activeBrowserSessionId: '',
      sessions: [],
    };
  }

  const sessions = project.sessions
    .filter((session) => isShareableBrowserSession(session.type))
    .map((session): BrowserSessionSnapshot | null => {
      const instance = getBrowserTabInstance(session.id);
      if (!instance) return null;
      let canGoBack = false;
      let canGoForward = false;
      try {
        canGoBack = instance.webview.canGoBack();
        canGoForward = instance.webview.canGoForward();
      } catch {
        canGoBack = false;
        canGoForward = false;
      }
      return {
        id: session.id,
        name: session.name,
        url: instance.committedUrl || instance.webview.src || 'about:blank',
        inspectMode: Boolean(instance.inspectMode),
        canGoBack,
        canGoForward,
        viewportLabel: instance.currentViewport.label,
        selectedElementSummary: instance.selectedElement
          ? `<${instance.selectedElement.tagName}> ${instance.selectedElement.activeSelector.value}`
          : undefined,
      };
    })
    .filter((entry): entry is BrowserSessionSnapshot => entry !== null);

  let activeBrowserSessionId = '';
  const activeProjectSession = project.sessions.find((session) => session.id === project.activeSessionId);
  if (activeProjectSession && isShareableBrowserSession(activeProjectSession.type)) {
    activeBrowserSessionId = activeProjectSession.id;
  } else {
    const firstSession = sessions[0];
    if (firstSession) {
      activeBrowserSessionId = firstSession.id;
    }
  }
  if (activeBrowserSessionId && !sessions.some((session) => session.id === activeBrowserSessionId)) {
    activeBrowserSessionId = sessions[0]?.id ?? '';
  }

  return {
    activeBrowserSessionId,
    sessions,
  };
}

export function resolveBrowserTargetSessionId(ownerSessionId: string, requestedSessionId?: string): string | null {
  const catalog = buildBrowserSessionCatalog(ownerSessionId);
  if (catalog.sessions.length === 0) return null;
  const normalizedRequested = String(requestedSessionId || '').trim();
  if (normalizedRequested && catalog.sessions.some((session) => session.id === normalizedRequested)) {
    return normalizedRequested;
  }
  if (catalog.activeBrowserSessionId && catalog.sessions.some((session) => session.id === catalog.activeBrowserSessionId)) {
    return catalog.activeBrowserSessionId;
  }
  return catalog.sessions[0]?.id ?? null;
}

export function buildInspectPromptFromSelection(
  instance: ReturnType<typeof getBrowserTabInstance>,
  instruction: string,
): string | null {
  if (!instance) return null;
  const info = instance.selectedElement;
  const trimmedInstruction = instruction.trim();
  if (!info || !trimmedInstruction) return null;

  const clickPoint = info.clickPoint
    ? `, point: '${Math.round(info.clickPoint.normalizedX * 100)}% x ${Math.round(info.clickPoint.normalizedY * 100)}%'`
    : '';
  const canvasHint = info.isCanvasLike ? ', surface: canvas-like element' : '';

  return (
    `Regarding the <${info.tagName}> element at ${info.pageUrl} ` +
    `(selector: '${info.activeSelector.value}'` +
    (info.textContent ? `, text: '${info.textContent}'` : '') +
    `${clickPoint}${canvasHint}): ${trimmedInstruction}`
  );
}
