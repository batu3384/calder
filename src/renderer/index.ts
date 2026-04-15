import { appState } from './state.js';
import { initSidebar, promptNewProject } from './components/sidebar.js';
import { initTabBar } from './components/tab-bar.js';
import { initSplitLayout } from './components/split-layout.js';
import { initKeybindings } from './keybindings.js';
import { handlePtyData, destroyTerminal, updateCostDisplay, updateContextDisplay } from './components/terminal-pane.js';
import { setHookStatus, notifyInterrupt } from './session-activity.js';
import { parseCost, setCostData, onChange as onCostChange } from './session-cost.js';
import { parseTitle, clearSession as clearTitleSession } from './session-title.js';
import { setContextData, onChange as onContextChange } from './session-context.js';
import { initConfigSections } from './components/config-sections.js';
import { initNotificationSound } from './notification-sound.js';
import { initNotificationDesktop } from './notification-desktop.js';
import { init as initSessionUnread } from './session-unread.js';
import { initProjectTerminal, handleShellPtyData, handleShellPtyExit, isShellSessionId } from './components/project-terminal.js';
import { startPolling as startGitPolling } from './git-status.js';
import { initDebugPanel, logDebugEvent } from './components/debug-panel.js';
import { initGitPanel } from './components/git-panel.js';
import { initUpdateBanner } from './components/update-banner.js';
import { initSessionHistory } from './components/session-history.js';
import { showUsageModal } from './components/usage-modal.js';
import { captureInitialContext } from './session-insights.js';
import { initInsightAlert } from './components/insight-alert.js';
import { initToolDetector } from './tools/missing-tool-detector.js';
import { initToolAlert } from './components/tool-alert.js';
import { initLargeFileDetector } from './tools/large-file-detector.js';
import { initLargeFileAlert } from './components/large-file-alert.js';
import { initSettingsGuard } from './components/settings-guard-ui.js';
import { checkWhatsNew } from './components/whats-new-dialog.js';
import { initShareManager, forwardPtyData, endShare, cleanupAllShares } from './sharing/share-manager.js';
import { isSharing } from './sharing/peer-host.js';
import { checkStarPrompt } from './components/star-prompt-dialog.js';
import { addEvents as addInspectorEvents } from './session-inspector-state.js';
import type { InspectorEvent } from '../shared/types.js';
import { getContext } from './session-context.js';
import { initSessionInspector } from './components/session-inspector.js';
import { loadProviderMetas } from './provider-availability.js';
import { initContextInspector } from './components/context-inspector.js';
import { createBrowserTabPane, getBrowserTabInstance } from './components/browser-tab-pane.js';
import { navigateTo } from './components/browser-tab/navigation.js';
import { initProjectContextSync } from './project-context-sync.js';
import { initProjectWorkflowSync } from './project-workflow-sync.js';
import { initProjectTeamContextSync } from './project-team-context-sync.js';
import { initProjectReviewSync } from './project-review-sync.js';
import { initProjectGovernanceSync } from './project-governance-sync.js';
import { initProjectBackgroundTaskSync } from './project-background-task-sync.js';
import { initProjectCheckpointSync } from './project-checkpoint-sync.js';
import { initLocalization } from './i18n.js';

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
  cleanupAllShares();
});

window.calder.app.onOpenEmbeddedBrowserUrl((payload) => {
  const project = appState.findProjectForPath(payload.cwd) ?? appState.activeProject;
  if (!project) return;
  const now = Date.now();
  const previousUrl = canonicalizeEmbeddedUrl(project.surface?.web?.url);
  const requestedUrl = canonicalizeEmbeddedUrl(payload.url);
  if (!shouldAcceptEmbeddedRoute(project.id, requestedUrl, now)) return;
  if (requestedUrl && previousUrl && requestedUrl === previousUrl) {
    return;
  }

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
    navigateTo(instance, payload.url);
    return;
  }

  queueMicrotask(() => {
    const delayedInstance = getBrowserTabInstance(session.id);
    if (delayedInstance) {
      navigateTo(delayedInstance, payload.url);
    }
  });
});

async function main(): Promise<void> {
  // Wire PTY data/exit events from main process
  window.calder.pty.onData((sessionId, data) => {
    if (isShellSessionId(sessionId)) {
      handleShellPtyData(sessionId, data);
    } else if (!isMcpSession(sessionId)) {
      handlePtyData(sessionId, data);
      parseCost(sessionId, data);
      parseTitle(sessionId, data);
      if (data.includes('Interrupted')) {
        notifyInterrupt(sessionId);
      }
      // Forward to P2P share if active
      if (isSharing(sessionId)) {
        forwardPtyData(sessionId, data);
      }
    }
  });

  window.calder.session.onCostData((sessionId, costData) => {
    if (!appState.hasSession(sessionId)) return;
    logDebugEvent('costData', sessionId, costData);
    setCostData(sessionId, costData);
    const contextBefore = getContext(sessionId);
    setContextData(sessionId, costData.context_window);
    captureInitialContext(sessionId, costData.context_window);

    // Bridge cost/context into inspector events so Costs & Context tabs work.
    // Only emit when context actually changed (avoids filling the event buffer with duplicates).
    const contextAfter = getContext(sessionId);
    if (contextAfter && contextAfter !== contextBefore) {
      const syntheticEvent: InspectorEvent = {
        type: 'status_update',
        timestamp: Date.now(),
        hookEvent: 'StatusLine',
        cost_snapshot: {
          total_cost_usd: costData.cost.total_cost_usd ?? 0,
          total_duration_ms: costData.cost.total_duration_ms ?? 0,
        },
        context_snapshot: {
          total_tokens: contextAfter.totalTokens,
          context_window_size: contextAfter.contextWindowSize,
          used_percentage: contextAfter.usedPercentage,
        },
      };
      addInspectorEvents(sessionId, [syntheticEvent]);
    }
  });

  onCostChange((sessionId, cost) => {
    updateCostDisplay(sessionId, cost);
    appState.updateSessionCost(sessionId, cost);
  });

  onContextChange((sessionId, info) => {
    updateContextDisplay(sessionId, info);
    appState.updateSessionContext(sessionId, info);
  });

  window.calder.session.onHookStatus((sessionId, status, hookName) => {
    if (!appState.hasSession(sessionId)) return;
    logDebugEvent('hookStatus', sessionId, hookName ? `${hookName}: ${status}` : status);
    setHookStatus(sessionId, status, hookName);
  });

  window.calder.session.onInspectorEvents((sessionId, events) => {
    if (!appState.hasSession(sessionId)) return;
    logDebugEvent('inspectorEvents', sessionId, { count: events.length });
    addInspectorEvents(sessionId, events);
  });

  window.calder.session.onCliSessionId((sessionId, cliSessionId) => {
    logDebugEvent('cliSessionId', sessionId, cliSessionId);
    // Find the project containing this session and persist the CLI session ID
    const project = appState.projects.find(p => p.sessions.some(s => s.id === sessionId));
    if (project) {
      clearTitleSession(sessionId);
      appState.updateSessionCliId(project.id, sessionId, cliSessionId);
    }
  });

  window.calder.pty.onExit((sessionId, exitCode) => {
    logDebugEvent('ptyExit', sessionId, { exitCode });
    if (isShellSessionId(sessionId)) {
      handleShellPtyExit(sessionId, exitCode);
    } else if (!isMcpSession(sessionId) && !isQuitting) {
      // End any active P2P share for this session
      if (isSharing(sessionId)) {
        endShare(sessionId);
      }
      // Auto-close the session when CLI exits (skip during app quit to preserve session state)
      const project = appState.projects.find(p => p.sessions.some(s => s.id === sessionId));
      if (project) {
        destroyTerminal(sessionId);
        clearTitleSession(sessionId);
        appState.removeSession(project.id, sessionId);
      }
    }
  });

  // Load provider metadata before components so capabilities are available synchronously
  await loadProviderMetas();

  // Initialize components
  initSessionUnread();
  initSidebar();
  initContextInspector();
  initTabBar();
  initSplitLayout();
  initKeybindings();
  initConfigSections();
  initNotificationSound();
  initNotificationDesktop();
  initProjectTerminal();
  initDebugPanel();
  initGitPanel();
  initSessionHistory();
  initUpdateBanner();
  initInsightAlert();
  initToolDetector();
  initToolAlert();
  initLargeFileDetector();
  initLargeFileAlert();
  initSettingsGuard();
  initShareManager();
  initSessionInspector();
  startGitPolling();

  window.calder.menu.onUsageStats(() => showUsageModal());

  function isMcpSession(sessionId: string): boolean {
    for (const project of appState.projects) {
      const session = project.sessions.find(s => s.id === sessionId);
      if (session) return session.type === 'mcp-inspector';
    }
    return false;
  }

  // Log AppState events to debug panel
  const stateEvents = [
    'project-added', 'project-removed', 'project-changed',
    'session-added', 'session-removed', 'session-changed',
    'layout-changed', 'history-changed', 'insights-changed', 'state-loaded',
  ] as const;
  for (const evt of stateEvents) {
    appState.on(evt as Parameters<typeof appState.on>[0], (data) => {
      logDebugEvent('stateEvent', evt, data);
    });
  }

  // Load persisted state
  await appState.load();
  initLocalization();
  initProjectContextSync();
  initProjectWorkflowSync();
  initProjectTeamContextSync();
  initProjectReviewSync();
  initProjectGovernanceSync();
  initProjectBackgroundTaskSync();
  initProjectCheckpointSync();

  // Auto-open new project modal when no projects exist
  if (appState.projects.length === 0) {
    promptNewProject();
  }

  checkWhatsNew();
  checkStarPrompt();
}

main().catch(console.error);
