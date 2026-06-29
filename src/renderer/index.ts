import {
  cleanupRendererSessionResourcesOnQuit,
  createRendererSessionOrchestrator,
} from './bootstrap/renderer-session-orchestrator.js';
import { navigateTo } from './components/browser-tab/navigation.js';
import { createBrowserTabPane, getBrowserTabInstance } from './components/browser-tab-pane.js';
import { initKeybindings } from './keybindings.js';
import { appState } from './state.js';

let isQuitting = false;
const EMBEDDED_REVERT_WINDOW_MS = 1800;
const lastEmbeddedRoutes = new Map<string, { previous: string; current: string; at: number }>();

function canonicalizeEmbeddedUrl(url: string | undefined): string {
  const value = (url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    return parsed.href;
  } catch {
    return value;
  }
}

function sameEmbeddedOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function shouldAcceptEmbeddedRoute(projectId: string, requestedUrl: string, now: number): boolean {
  const lastRoute = lastEmbeddedRoutes.get(projectId);
  if (!lastRoute) return true;
  if (now - lastRoute.at > EMBEDDED_REVERT_WINDOW_MS) return true;
  if (!sameEmbeddedOrigin(lastRoute.current, requestedUrl)) return true;
  if (lastRoute.current === requestedUrl) return false;
  return true;
}

window.calder.app.onQuitting(() => {
  isQuitting = true;
  cleanupRendererSessionResourcesOnQuit();
});

window.calder.app.onOpenEmbeddedBrowserUrl((payload) => {
  const projectFromSession = payload.sessionId
    ? appState.projects.find((entry) => entry.sessions.some((session) => session.id === payload.sessionId))
    : undefined;
  const projectFromPath = payload.cwd ? appState.findProjectForPath(payload.cwd) : undefined;
  const project = projectFromSession ?? projectFromPath ?? appState.activeProject;
  if (!project) return;
  const now = Date.now();
  const previousUrl = canonicalizeEmbeddedUrl(project.surface?.web?.url);
  const requestedUrl = canonicalizeEmbeddedUrl(payload.url);
  if (!shouldAcceptEmbeddedRoute(project.id, requestedUrl, now)) return;
  const isSameRoute = !!(requestedUrl && previousUrl && requestedUrl === previousUrl);

  if (appState.activeProjectId !== project.id) {
    appState.setActiveProject(project.id);
  }
  const session = appState.openUrlInBrowserSurface(project.id, payload.url);
  if (!session) return;
  if (requestedUrl) {
    lastEmbeddedRoutes.set(project.id, {
      previous: previousUrl,
      current: requestedUrl,
      at: now,
    });
  }
  createBrowserTabPane(session.id, session.browserTabUrl ?? payload.url);
  const instance = getBrowserTabInstance(session.id);
  if (instance) {
    if (!isSameRoute) {
      navigateTo(instance, payload.url);
    }
    return;
  }

  queueMicrotask(() => {
    const delayedInstance = getBrowserTabInstance(session.id);
    if (delayedInstance && !isSameRoute) {
      navigateTo(delayedInstance, payload.url);
    }
  });
});

async function main(): Promise<void> {
  const sessionOrchestrator = createRendererSessionOrchestrator({
    isQuitting: () => isQuitting,
    initKeybindings,
  });

  // Wire PTY data/exit events from main process
  window.calder.pty.onData((sessionId, data) => {
    sessionOrchestrator.handlePtyData(sessionId, data);
  });

  window.calder.session.onCostData((sessionId, costData) => {
    sessionOrchestrator.handleCostData(sessionId, costData);
  });

  window.calder.session.onHookStatus((sessionId, status, hookName) => {
    sessionOrchestrator.handleHookStatus(sessionId, status, hookName);
  });

  window.calder.session.onInspectorEvents((sessionId, events) => {
    sessionOrchestrator.handleInspectorEvents(sessionId, events);
  });

  window.calder.session.onCliSessionId((sessionId, cliSessionId) => {
    sessionOrchestrator.handleCliSessionId(sessionId, cliSessionId);
  });

  window.calder.pty.onExit((sessionId, exitCode) => {
    sessionOrchestrator.handlePtyExit(sessionId, exitCode);
  });

  await sessionOrchestrator.initialize();
}

main().catch(console.error);
