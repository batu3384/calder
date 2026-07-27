import { BrowserWindow, ipcMain } from 'electron';

import { assertProjectGovernanceAllows } from './calder-governance/enforcement';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';
import {
  registerPendingCodexSession,
  startCodexSessionWatcher,
  stopCodexSessionWatcher,
  unregisterCodexSession,
} from './codex-session-watcher';
import {
  cleanupSessionStatus,
  startWatching,
  stopWatching as stopHookWatching,
} from './hooks/hook-status';
import { registerAppBrowserIpcHandlers } from './ipc-app-browser';
import { isAutoApprovalMode, updateAutoApprovalMode } from './ipc-auto-approval-governance';
import { registerCalderIpcHandlers, resetCalderProjectWatchers } from './ipc-calder';
import { registerCliSurfaceIpcHandlers } from './ipc-cli-surface';
import { registerFsStoreIpcHandlers } from './ipc-fs-store';
import { registerGitIpcHandlers } from './ipc-git';
import {
  clearInspectorOrchestrationSession,
  createInspectorOrchestration,
  resetInspectorOrchestrationCaches,
} from './ipc-inspector-orchestration';
import { registerMaintenanceIpcHandlers } from './ipc-maintenance';
import {
  getActiveProjectPath,
  isAllowedDirectoryLookupPath,
  isAllowedReadPath,
  isWithinKnownProject,
  requireKnownProjectPath,
} from './ipc-path-policy';
import { registerProviderIpcHandlers } from './ipc-provider';
import { registerProviderUpdateIpcHandlers } from './ipc-provider-update';
import { registerPtyIpcHandlers } from './ipc-pty';
import { sanitizePersistedStateForSave } from './ipc-state-sanitizer';
import { registerMcpHandlers } from './mcp-ipc-handlers';
import { createAppMenu } from './menu';
import { loadState } from './store';

let hookWatcherStarted = false;

const cliSurfaceRuntime = createCliSurfaceRuntimeManager({
  data: (projectId, data) =>
    BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:data', projectId, data),
  exit: (projectId, exitCode, signal) =>
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      'cli-surface:exit',
      projectId,
      exitCode,
      signal,
    ),
  status: (projectId, state) =>
    BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:status', projectId, state),
  error: (projectId, message) =>
    BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:error', projectId, message),
});

export function resetHookWatcher(): void {
  hookWatcherStarted = false;
  stopHookWatching();
  stopCodexSessionWatcher();
  resetCalderProjectWatchers();
  resetInspectorOrchestrationCaches();
}

export function registerIpcHandlers(): void {
  const { autoApprovalOrchestrator, getGovernanceState, mirrorPlaywrightFromPtyData } =
    createInspectorOrchestration();

  registerPtyIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) =>
      assertProjectGovernanceAllows(projectPath, operation),
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
    validateProviderTrackingAndWarn: () => {},
    registerPendingProviderSessionWatchers: (providerId, cliSessionId, sessionId, cwd, win) => {
      if (providerId === 'codex' && !cliSessionId) {
        startCodexSessionWatcher(win);
        registerPendingCodexSession(sessionId, { cwd });
      }
    },
    mirrorPlaywrightFromPtyData,
    handlePtySessionExit: (sessionId) => {
      cleanupSessionStatus(sessionId);
      unregisterCodexSession(sessionId);
      autoApprovalOrchestrator.unregisterSession(sessionId);
      clearInspectorOrchestrationSession(sessionId);
    },
  });

  registerCliSurfaceIpcHandlers(cliSurfaceRuntime, {
    resolveProjectPath: (projectId) =>
      loadState().projects.find((project) => project.id === projectId)?.path,
    isWithinKnownProject,
  });

  registerFsStoreIpcHandlers({
    isAllowedDirectoryLookupPath,
    isAllowedReadPath,
    isWithinKnownProject,
    sanitizePersistedStateForSave,
  });
  registerMaintenanceIpcHandlers();
  registerGitIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) =>
      assertProjectGovernanceAllows(projectPath, operation),
  });
  registerProviderIpcHandlers();
  registerProviderUpdateIpcHandlers();

  ipcMain.handle('menu:rebuild', (_event, debugMode: boolean) => {
    createAppMenu(debugMode);
  });

  registerCalderIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) =>
      assertProjectGovernanceAllows(projectPath, operation),
    getGovernanceState,
    isAutoApprovalMode,
    updateAutoApprovalMode,
    setSessionAutoApprovalOverride: (sessionId, mode) =>
      autoApprovalOrchestrator.setSessionOverride(sessionId, mode),
  });
  registerAppBrowserIpcHandlers({
    requireKnownProjectPath,
    getActiveProjectPath,
    assertProjectGovernanceAllows: (projectPath, operation) =>
      assertProjectGovernanceAllows(projectPath, operation),
  });

  registerMcpHandlers();
}
