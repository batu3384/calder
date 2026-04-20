import { ipcMain, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { writePty } from './pty-manager';
import { loadState, PersistedState } from './store';
import { startWatching, cleanupSessionStatus, setInspectorEventsMiddleware, stopWatching as stopHookWatching } from './hook-status';
import { startCodexSessionWatcher, registerPendingCodexSession, unregisterCodexSession, stopCodexSessionWatcher } from './codex-session-watcher';
import { startBlackboxSessionWatcher, registerPendingBlackboxSession, unregisterBlackboxSession, stopBlackboxSessionWatcher } from './blackbox-session-watcher';
import { registerMcpHandlers } from './mcp-ipc-handlers';
import { registerFsStoreIpcHandlers } from './ipc-fs-store';
import { registerMaintenanceIpcHandlers } from './ipc-maintenance';
import { registerMcpGovernanceIpcHandlers } from './ipc-mcp-governance';
import { registerGitIpcHandlers } from './ipc-git';
import { registerProviderIpcHandlers } from './ipc-provider';
import { registerProviderUpdateIpcHandlers } from './ipc-provider-update';
import { registerMobileIpcHandlers } from './ipc-mobile';
import { registerCalderIpcHandlers, resetCalderProjectWatchers } from './ipc-calder';
import { registerAppBrowserIpcHandlers } from './ipc-app-browser';
import { registerCliSurfaceIpcHandlers } from './ipc-cli-surface';
import { registerPtyIpcHandlers } from './ipc-pty';
import { sanitizePersistedStateForSave as sanitizePersistedStateForSavePayload } from './ipc-state-sanitizer';
import {
  PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS,
  appendAutoApprovalAudit,
  extractPlaywrightNavigateUrlsFromTerminalChunk,
  shouldMirrorPlaywrightNavigate,
  shouldMirrorPlaywrightNavigateUrl,
  type PlaywrightMirrorState,
  type PlaywrightMirrorTarget,
} from './ipc-playwright-mirror';
import { createAppMenu } from './menu';
import { getProvider } from './providers/registry';
import type { AutoApprovalMode, ProjectGovernanceState, ProviderId, InspectorEvent } from '../shared/types';
import { isMac, isWin } from './platform';
import { isTrackingHealthy } from '../shared/tracking-health';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { POLICY_RELATIVE_PATH, discoverProjectGovernance } from './calder-governance/discovery';
import { assertProjectGovernanceAllows } from './calder-governance/enforcement';
import { createAutoApprovalOrchestrator } from './calder-governance/auto-approval-orchestrator';
import { resolveAutoApprovalInput } from './calder-governance/auto-approval-dispatch';
import {
  GLOBAL_AUTO_APPROVAL_POLICY_PATH,
  resolveEffectiveAutoApprovalMode,
  setAutoApprovalModeInPolicyFile,
} from './calder-governance/auto-approval-policy';
import {
  buildMiniMaxToolCallRecoveryPrompt,
  shouldTriggerMiniMaxToolCallRecovery,
  type MiniMaxToolCallRecoveryState,
} from './minimax-toolcall-recovery';

/**
 * Check if a resolved path is within one of the known project directories.
 */
function isWithinKnownProject(resolvedPath: string): boolean {
  const state = loadState();
  return state.projects.some(p => resolvedPath.startsWith(p.path + path.sep) || resolvedPath === p.path);
}

function requireKnownProjectPath(projectPath: string, contextLabel: string): string {
  const resolvedPath = path.resolve(projectPath);
  if (!isWithinKnownProject(resolvedPath)) {
    throw new Error(`${contextLabel} requires a known project path`);
  }
  return resolvedPath;
}

function getActiveProjectPath(): string | undefined {
  const state = loadState();
  if (!state.activeProjectId) return undefined;
  return state.projects.find((candidate) => candidate.id === state.activeProjectId)?.path;
}

function isWithinPrefix(resolvedPath: string, prefix: string): boolean {
  return resolvedPath === prefix || resolvedPath.startsWith(prefix + path.sep);
}

/**
 * Check if a resolved path is allowed for reading:
 * within a known project directory OR a known config location.
 */
function isAllowedReadPath(resolvedPath: string): boolean {
  // Allow files within known project directories
  if (isWithinKnownProject(resolvedPath)) {
    return true;
  }

  // Allow known config files/directories used by supported CLIs
  const home = os.homedir();
  const allowedPaths = [
    path.join(home, '.claude.json'),
    path.join(home, '.mcp.json'),
    path.join(home, '.claude') + path.sep,
    path.join(home, '.codex') + path.sep,
    path.join(home, '.copilot') + path.sep,
    path.join(home, '.qwen') + path.sep,
    path.join(home, '.mmx') + path.sep,
    path.join(home, '.blackboxcli') + path.sep,
  ];

  if (isMac) {
    allowedPaths.push('/Library/Application Support/ClaudeCode/');
  } else if (isWin) {
    allowedPaths.push('C:\\Program Files\\ClaudeCode\\');
  } else {
    allowedPaths.push('/etc/claude-code/');
  }

  return allowedPaths.some(allowed => resolvedPath === allowed || resolvedPath.startsWith(allowed));
}

function isAllowedDirectoryLookupPath(resolvedPath: string): boolean {
  if (isAllowedReadPath(resolvedPath)) {
    return true;
  }

  const homePath = path.resolve(os.homedir());
  if (isWithinPrefix(resolvedPath, homePath)) {
    return true;
  }

  if (isMac) {
    return isWithinPrefix(resolvedPath, path.resolve('/Volumes'));
  }

  if (!isWin) {
    return isWithinPrefix(resolvedPath, path.resolve('/mnt')) || isWithinPrefix(resolvedPath, path.resolve('/media'));
  }

  return false;
}

function sanitizePersistedStateForSave(state: unknown): PersistedState {
  return sanitizePersistedStateForSavePayload(state);
}

function isAutoApprovalMode(value: unknown): value is AutoApprovalMode {
  return value === 'off'
    || value === 'edit_only'
    || value === 'edit_plus_safe_tools'
    || value === 'full_auto'
    || value === 'full_auto_unsafe';
}

function updateAutoApprovalMode(projectPath: string, scope: 'global' | 'project', mode: AutoApprovalMode | null): void {
  const targetPath = scope === 'global'
    ? GLOBAL_AUTO_APPROVAL_POLICY_PATH
    : path.join(projectPath, POLICY_RELATIVE_PATH);
  setAutoApprovalModeInPolicyFile(targetPath, mode);
}

async function applySessionOverrideToGovernanceState(
  state: ProjectGovernanceState,
  sessionMode: AutoApprovalMode | undefined,
): Promise<ProjectGovernanceState> {
  if (!state.autoApproval || sessionMode === undefined) return state;

  const resolved = resolveEffectiveAutoApprovalMode({
    globalMode: state.autoApproval.globalMode,
    hasGlobalMode: true,
    projectMode: state.autoApproval.projectMode,
    hasProjectMode: state.autoApproval.projectMode !== undefined,
    sessionMode,
    hasSessionMode: true,
  });

  return {
    ...state,
    autoApproval: {
      ...state.autoApproval,
      sessionMode,
      effectiveMode: resolved.effectiveMode,
      policySource: resolved.policySource,
    },
  };
}

let hookWatcherStarted = false;
const miniMaxToolCallRecoveryBySession = new Map<string, MiniMaxToolCallRecoveryState>();
const MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS = 45_000;
const playwrightMirrorBySession = new Map<string, PlaywrightMirrorState>();
const playwrightTranscriptBufferBySession = new Map<string, string>();

const cliSurfaceRuntime = createCliSurfaceRuntimeManager({
  data: (projectId, data) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:data', projectId, data),
  exit: (projectId, exitCode, signal) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:exit', projectId, exitCode, signal),
  status: (projectId, state) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:status', projectId, state),
  error: (projectId, message) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:error', projectId, message),
});

export function resetHookWatcher(): void {
  hookWatcherStarted = false;
  stopHookWatching();
  stopCodexSessionWatcher();
  stopBlackboxSessionWatcher();
  resetCalderProjectWatchers();
  miniMaxToolCallRecoveryBySession.clear();
  playwrightMirrorBySession.clear();
  playwrightTranscriptBufferBySession.clear();
}

export function registerIpcHandlers(): void {
  const autoApprovalOrchestrator = createAutoApprovalOrchestrator({
    sendApproval: (sessionId, providerId) => {
      const approvalInput = resolveAutoApprovalInput(providerId);
      const sent = writePty(sessionId, approvalInput);
      if (!sent) {
        throw new Error(`Failed to write approval input: missing PTY session (${sessionId}).`);
      }
    },
    emitInspectorEvents: (sessionId, events) => {
      appendAutoApprovalAudit(sessionId, events);
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('session:inspectorEvents', sessionId, events);
      }
    },
  });

  setInspectorEventsMiddleware((sessionId, events) => {
    void autoApprovalOrchestrator.handleInspectorEvents(sessionId, events).catch((error) => {
      console.warn('Auto-approval orchestrator failed:', error);
    });
    let finalEvents = events;
    for (const event of events) {
      const now = Date.now();

      const mirroredTarget = shouldMirrorPlaywrightNavigate(sessionId, event, playwrightMirrorBySession, now);
      if (mirroredTarget) {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          void openUrlWithBrowserPolicy(
            {
              url: mirroredTarget.url,
              cwd: mirroredTarget.cwd,
              sessionId: mirroredTarget.sessionId,
              preferEmbedded: true,
            },
            win,
            (target) => shell.openExternal(target),
          ).catch((error) => {
            console.warn('Playwright mirror open failed:', error);
          });
        }
        finalEvents = [
          ...finalEvents,
          {
            type: 'status_update',
            timestamp: now,
            hookEvent: 'PlaywrightMirror',
            message: `Mirrored Playwright navigate to Calder browser: ${mirroredTarget.url}`,
          },
        ];
      }

      if (event.type !== 'stop') continue;
      const lastMessage = typeof event.last_assistant_message === 'string'
        ? event.last_assistant_message
        : '';
      const previousState = miniMaxToolCallRecoveryBySession.get(sessionId);
      if (!shouldTriggerMiniMaxToolCallRecovery(lastMessage, previousState, now, MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS)) {
        continue;
      }

      const normalizedMessage = lastMessage.trim();
      miniMaxToolCallRecoveryBySession.set(sessionId, {
        lastTriggeredAt: now,
        lastMessage: normalizedMessage,
        attempts: (previousState?.attempts ?? 0) + 1,
      });

      try {
        writePty(sessionId, `${buildMiniMaxToolCallRecoveryPrompt()}\n`);
      } catch (error) {
        console.warn('MiniMax tool-call recovery dispatch failed:', error);
      }

      finalEvents = [
        ...finalEvents,
        {
          type: 'status_update',
          timestamp: now,
          hookEvent: 'MiniMaxToolCallRecovery',
          message: 'MiniMax pseudo tool-call markup detected; recovery prompt was sent automatically.',
        },
      ];
    }
    return finalEvents;
  });
  const getGovernanceState = async (projectPath: string, sessionId?: string): Promise<ProjectGovernanceState> => {
    const baseState = await discoverProjectGovernance(projectPath);
    const sessionMode = sessionId ? autoApprovalOrchestrator.getSessionOverride(sessionId) : undefined;
    return applySessionOverrideToGovernanceState(baseState, sessionMode);
  };

  const mirrorPlaywrightFromPtyData = (sessionId: string, cwd: string, chunk: string): void => {
    if (!chunk || chunk.length === 0) return;
    const previous = playwrightTranscriptBufferBySession.get(sessionId) ?? '';
    const combined = `${previous}${chunk}`;
    const buffer = combined.length > PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS
      ? combined.slice(-PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS)
      : combined;
    playwrightTranscriptBufferBySession.set(sessionId, buffer);

    const urls = extractPlaywrightNavigateUrlsFromTerminalChunk(buffer);
    if (urls.length === 0) return;

    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;

    for (const url of urls) {
      const now = Date.now();
      if (!shouldMirrorPlaywrightNavigateUrl(sessionId, url, playwrightMirrorBySession, now)) {
        continue;
      }

      void openUrlWithBrowserPolicy(
        { url, cwd, sessionId, preferEmbedded: true },
        win,
        (target) => shell.openExternal(target),
      ).catch((error) => {
        console.warn('Playwright transcript mirror open failed:', error);
      });

      win.webContents.send('session:inspectorEvents', sessionId, [{
        type: 'status_update',
        timestamp: now,
        hookEvent: 'PlaywrightMirror',
        message: `Mirrored Playwright navigate from terminal output: ${url}`,
      } satisfies InspectorEvent]);
    }
  };

  registerPtyIpcHandlers({
    isWithinKnownProject,
    ensureHookWatcherStarted: (win) => {
      if (hookWatcherStarted) return;
      startWatching(win);
      hookWatcherStarted = true;
    },
    registerAutoApprovalSession: (sessionId, providerId, cwd) => {
      autoApprovalOrchestrator.registerSession(sessionId, providerId, cwd);
    },
    unregisterAutoApprovalSession: (sessionId) => {
      autoApprovalOrchestrator.unregisterSession(sessionId);
    },
    validateProviderTrackingAndWarn: (win, sessionId, providerId) => {
      const provider = getProvider(providerId);
      if (!provider.meta.capabilities.hookStatus) return;
      let validation = provider.validateSettings();
      if (!isTrackingHealthy(provider.meta, validation)) {
        try {
          provider.reinstallSettings();
          validation = provider.validateSettings();
        } catch (error) {
          console.warn('Auto-heal settings reinstall failed:', error);
        }
      }
      if (isTrackingHealthy(provider.meta, validation)) return;
      win.webContents.send('settings:warning', {
        sessionId,
        providerId,
        statusLine: validation.statusLine,
        hooks: validation.hooks,
      });
    },
    registerPendingProviderSessionWatchers: (providerId, cliSessionId, sessionId, win) => {
      if (providerId === 'codex' && !cliSessionId) {
        startCodexSessionWatcher(win);
        registerPendingCodexSession(sessionId);
      }

      if (providerId === 'blackbox' && !cliSessionId) {
        startBlackboxSessionWatcher(win);
        registerPendingBlackboxSession(sessionId);
      }
    },
    mirrorPlaywrightFromPtyData,
    handlePtySessionExit: (sessionId) => {
      cleanupSessionStatus(sessionId);
      unregisterCodexSession(sessionId);
      unregisterBlackboxSession(sessionId);
      autoApprovalOrchestrator.unregisterSession(sessionId);
      miniMaxToolCallRecoveryBySession.delete(sessionId);
      playwrightMirrorBySession.delete(sessionId);
      playwrightTranscriptBufferBySession.delete(sessionId);
    },
  });

  registerCliSurfaceIpcHandlers(cliSurfaceRuntime);

  registerFsStoreIpcHandlers({
    isAllowedDirectoryLookupPath,
    isAllowedReadPath,
    isWithinKnownProject,
    sanitizePersistedStateForSave,
  });
  registerMaintenanceIpcHandlers();
  registerMcpGovernanceIpcHandlers({
    requireKnownProjectPath,
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
  });
  registerGitIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
  });
  registerProviderIpcHandlers();
  registerProviderUpdateIpcHandlers();
  registerMobileIpcHandlers();

  ipcMain.handle('menu:rebuild', (_event, debugMode: boolean) => {
    createAppMenu(debugMode);
  });

  registerCalderIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
    getGovernanceState,
    isAutoApprovalMode,
    updateAutoApprovalMode,
    setSessionAutoApprovalOverride: (sessionId, mode) => autoApprovalOrchestrator.setSessionOverride(sessionId, mode),
  });
  registerAppBrowserIpcHandlers({
    requireKnownProjectPath,
    getActiveProjectPath,
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
  });

  registerMcpHandlers();
}
