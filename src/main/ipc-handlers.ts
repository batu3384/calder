import { ipcMain, BrowserWindow } from 'electron';
import { startWatching, cleanupSessionStatus, stopWatching as stopHookWatching } from './hooks/hook-status';
import { startCodexSessionWatcher, registerPendingCodexSession, unregisterCodexSession, stopCodexSessionWatcher } from './codex-session-watcher';
import { startCopilotSessionWatcher, registerPendingCopilotSession, unregisterCopilotSession, stopCopilotSessionWatcher } from './copilot-session-watcher';
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
import { sanitizePersistedStateForSave } from './ipc-state-sanitizer';
import {
  clearInspectorOrchestrationSession,
  createInspectorOrchestration,
  resetInspectorOrchestrationCaches,
} from './ipc-inspector-orchestration';
import {
  getActiveProjectPath,
  isAllowedDirectoryLookupPath,
  isAllowedReadPath,
  isWithinKnownProject,
  requireKnownProjectPath,
} from './ipc-path-policy';
import {
  isAutoApprovalMode,
  updateAutoApprovalMode,
} from './ipc-auto-approval-governance';
import { createAppMenu } from './menu';
import { getProvider } from './providers/registry';
import { isTrackingHealthy } from '../shared/tracking-health';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';
import { assertProjectGovernanceAllows } from './calder-governance/enforcement';
import { loadState } from './store';

let hookWatcherStarted = false;

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
  stopCopilotSessionWatcher();
  resetCalderProjectWatchers();
  resetInspectorOrchestrationCaches();
}

export function registerIpcHandlers(): void {
  const {
    autoApprovalOrchestrator,
    getGovernanceState,
    mirrorPlaywrightFromPtyData,
  } = createInspectorOrchestration();

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
      let trackingHealthy = isTrackingHealthy(provider.meta, validation);
      if (!trackingHealthy) {
        const shouldSkipClaudeForeignStatuslineAutoHeal =
          providerId === 'claude'
          && validation.statusLine === 'foreign'
          && loadState().preferences.statusLineConsent === 'declined';

        if (shouldSkipClaudeForeignStatuslineAutoHeal) {
          win.webContents.send('settings:warning', {
            sessionId,
            providerId,
            statusLine: validation.statusLine,
            hooks: validation.hooks,
          });
          return;
        }

        try {
          provider.reinstallSettings();
          validation = provider.validateSettings();
          trackingHealthy = isTrackingHealthy(provider.meta, validation);
        } catch (error) {
          console.warn('Auto-heal settings reinstall failed:', error);
        }
      }
      if (trackingHealthy) return;
      win.webContents.send('settings:warning', {
        sessionId,
        providerId,
        statusLine: validation.statusLine,
        hooks: validation.hooks,
      });
    },
    registerPendingProviderSessionWatchers: (providerId, cliSessionId, sessionId, cwd, win) => {
      if (providerId === 'codex' && !cliSessionId) {
        startCodexSessionWatcher(win);
        registerPendingCodexSession(sessionId, { cwd });
      }
      if (providerId === 'copilot' && !cliSessionId) {
        startCopilotSessionWatcher(win);
        registerPendingCopilotSession(sessionId, { cwd });
      }
    },
    mirrorPlaywrightFromPtyData,
    handlePtySessionExit: (sessionId) => {
      cleanupSessionStatus(sessionId);
      unregisterCodexSession(sessionId);
      unregisterCopilotSession(sessionId);
      autoApprovalOrchestrator.unregisterSession(sessionId);
      clearInspectorOrchestrationSession(sessionId);
    },
  });

  registerCliSurfaceIpcHandlers(cliSurfaceRuntime, {
    resolveProjectPath: (projectId) => loadState().projects.find((project) => project.id === projectId)?.path,
    isWithinKnownProject,
  });

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
