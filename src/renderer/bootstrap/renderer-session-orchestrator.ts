import type { CostData, InspectorEvent } from '../../shared/types/session.js';
import { applyAppearanceTheme, bindAppearanceThemeListener } from '../appearance-theme.js';
import { destroyAlertBanner } from '../components/alert-banner.js';
import { initConfigSections } from '../components/config-sections/config-sections.js';
import { initContextInspector } from '../components/context-inspector.js';
import { initDebugPanel, logDebugEvent } from '../components/debug-panel.js';
import { initGitPanel } from '../components/git-panel.js';
import { initInsightAlert } from '../components/insight-alert.js';
import { initLargeFileAlert } from '../components/large-file-alert.js';
import { shouldShowOnboarding, showOnboardingDialog } from '../components/onboarding-dialog.js';
import {
  handleShellPtyData,
  handleShellPtyExit,
  initProjectTerminal,
  isShellSessionId,
} from '../components/project-terminal.js';
import { initSessionHistory } from '../components/session-history.js';
import { initSessionInspector } from '../components/session-inspector/session-inspector.js';
import { initSettingsGuard } from '../components/settings-guard-ui.js';
import { destroySidebar, initSidebar, promptNewProject } from '../components/sidebar.js';
import { initSplitLayout } from '../components/split-layout.js';
import { checkStarPrompt } from '../components/star-prompt-dialog.js';
import { initTabBar } from '../components/tab-bar/tab-bar.js';
import {
  destroyTerminal,
  handlePtyData,
  updateContextDisplay,
  updateCostDisplay,
} from '../components/terminal-pane.js';
import { dismissAllToasts } from '../components/toast.js';
import { initToolAlert } from '../components/tool-alert.js';
import { initUpdateBanner } from '../components/update-banner.js';
import { showUsageModal } from '../components/usage-modal.js';
import { checkWhatsNew } from '../components/whats-new-dialog.js';
import { startPolling as startGitPolling } from '../git-status.js';
import { initLocalization } from '../i18n.js';
import { initNotificationDesktop } from '../notification-desktop.js';
import { initNotificationSound } from '../notification-sound.js';
import { initProjectBackgroundTaskSync } from '../project-background-task-sync.js';
import { initProjectCheckpointSync } from '../project-checkpoint-sync.js';
import { initProjectContextSync } from '../project-context-sync.js';
import { initProjectGovernanceSync } from '../project-governance-sync.js';
import { initProjectReviewSync } from '../project-review-sync.js';
import { initProjectTeamContextSync } from '../project-team-context-sync.js';
import { initProjectWorkflowSync } from '../project-workflow-sync.js';
import { loadProviderMetas } from '../provider-availability.js';
import { notifyInterrupt, setHookStatus } from '../session-activity.js';
import {
  type ContextWindowInfo,
  getContext,
  onChange as onContextChange,
  setContextData,
} from '../session-context.js';
import {
  type CostInfo,
  onChange as onCostChange,
  parseCost,
  setCostData,
} from '../session-cost.js';
import { captureInitialContext } from '../session-insights.js';
import { addEvents as addInspectorEvents } from '../session-inspector-state.js';
import { clearSession as clearTitleSession, parseTitle } from '../session-title.js';
import { init as initSessionUnread } from '../session-unread.js';
import { isSharing } from '../sharing/peer-host.js';
import {
  cleanupAllShares,
  endShare,
  forwardPtyData,
  initShareManager,
} from '../sharing/share-manager.js';
import { appState } from '../state.js';
import { initLargeFileDetector } from '../tools/large-file-detector.js';
import { initToolDetector } from '../tools/missing-tool-detector.js';
import { initUpdateCenter } from '../update-center.js';

export interface RendererSessionOrchestrator {
  handlePtyData: (sessionId: string, data: string) => void;
  handleCostData: (sessionId: string, costData: CostData) => void;
  handleHookStatus: (
    sessionId: string,
    status: 'working' | 'waiting' | 'completed' | 'input',
    hookName?: string,
  ) => void;
  handleInspectorEvents: (sessionId: string, events: InspectorEvent[]) => void;
  handleCliSessionId: (sessionId: string, cliSessionId: string) => void;
  handlePtyExit: (sessionId: string, exitCode: number) => void;
  initialize: () => Promise<void>;
}

interface CreateRendererSessionOrchestratorOptions {
  isQuitting: () => boolean;
  initKeybindings: () => void;
}

export function cleanupRendererSessionResourcesOnQuit(): void {
  cleanupAllShares();
  destroySidebar();
  destroyAlertBanner();
  dismissAllToasts();
}

export function createRendererSessionOrchestrator(
  options: CreateRendererSessionOrchestratorOptions,
): RendererSessionOrchestrator {
  function isMcpSession(sessionId: string): boolean {
    for (const project of appState.projects) {
      const session = project.sessions.find((entry) => entry.id === sessionId);
      if (session) return session.type === 'mcp-inspector';
    }
    return false;
  }

  function handlePtyDataEvent(sessionId: string, data: string): void {
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
  }

  function handleCostDataEvent(sessionId: string, costData: CostData): void {
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
  }

  function handleHookStatusEvent(
    sessionId: string,
    status: 'working' | 'waiting' | 'completed' | 'input',
    hookName?: string,
  ): void {
    if (!appState.hasSession(sessionId)) return;
    logDebugEvent('hookStatus', sessionId, hookName ? `${hookName}: ${status}` : status);
    setHookStatus(sessionId, status, hookName);
  }

  function handleInspectorEventsEvent(sessionId: string, events: InspectorEvent[]): void {
    if (!appState.hasSession(sessionId)) return;
    logDebugEvent('inspectorEvents', sessionId, { count: events.length });
    addInspectorEvents(sessionId, events);
  }

  function handleCliSessionIdEvent(sessionId: string, cliSessionId: string): void {
    logDebugEvent('cliSessionId', sessionId, cliSessionId);
    // Find the project containing this session and persist the CLI session ID
    const project = appState.projects.find((entry) =>
      entry.sessions.some((session) => session.id === sessionId),
    );
    if (project) {
      clearTitleSession(sessionId);
      appState.updateSessionCliId(project.id, sessionId, cliSessionId);
    }
  }

  function handlePtyExitEvent(sessionId: string, exitCode: number): void {
    logDebugEvent('ptyExit', sessionId, { exitCode });
    if (isShellSessionId(sessionId)) {
      handleShellPtyExit(sessionId, exitCode);
    } else if (!isMcpSession(sessionId) && !options.isQuitting()) {
      // End any active P2P share for this session
      if (isSharing(sessionId)) {
        endShare(sessionId);
      }
      // Auto-close the session when CLI exits (skip during app quit to preserve session state)
      const project = appState.projects.find((entry) =>
        entry.sessions.some((session) => session.id === sessionId),
      );
      if (project) {
        destroyTerminal(sessionId);
        clearTitleSession(sessionId);
        appState.removeSession(project.id, sessionId);
      }
    }
  }

  function registerSessionTelemetryObservers(): void {
    onCostChange((sessionId: string, cost: CostInfo) => {
      updateCostDisplay(sessionId, cost);
      appState.updateSessionCost(sessionId, cost);
    });

    onContextChange((sessionId: string, info: ContextWindowInfo) => {
      updateContextDisplay(sessionId, info);
      appState.updateSessionContext(sessionId, info);
    });
  }

  function registerStateDebugEvents(): void {
    const stateEvents = [
      'project-added',
      'project-removed',
      'project-changed',
      'session-added',
      'session-removed',
      'session-changed',
      'layout-changed',
      'history-changed',
      'insights-changed',
      'state-loaded',
    ] as const;
    for (const evt of stateEvents) {
      appState.on(evt as Parameters<typeof appState.on>[0], (data) => {
        logDebugEvent('stateEvent', evt, data);
      });
    }
  }

  async function initialize(): Promise<void> {
    registerSessionTelemetryObservers();

    // Load provider metadata before components so capabilities are available synchronously
    await loadProviderMetas();
    initUpdateCenter();

    // Initialize components
    initSessionUnread();
    initSidebar();
    initContextInspector();
    initTabBar();
    initSplitLayout();
    options.initKeybindings();
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
    registerStateDebugEvents();

    // Load persisted state
    await appState.load();
    applyAppearanceTheme(appState.preferences.appearanceTheme);
    bindAppearanceThemeListener(() => {
      if ((appState.preferences.appearanceTheme ?? 'system') === 'system') {
        applyAppearanceTheme('system');
      }
    });
    initLocalization();
    initProjectContextSync();
    initProjectWorkflowSync();
    initProjectTeamContextSync();
    initProjectReviewSync();
    initProjectGovernanceSync();
    initProjectBackgroundTaskSync();
    initProjectCheckpointSync();

    if (shouldShowOnboarding()) {
      showOnboardingDialog();
    } else if (appState.projects.length === 0) {
      promptNewProject();
    }

    checkWhatsNew();
    checkStarPrompt();
  }

  return {
    handlePtyData: handlePtyDataEvent,
    handleCostData: handleCostDataEvent,
    handleHookStatus: handleHookStatusEvent,
    handleInspectorEvents: handleInspectorEventsEvent,
    handleCliSessionId: handleCliSessionIdEvent,
    handlePtyExit: handlePtyExitEvent,
    initialize,
  };
}
