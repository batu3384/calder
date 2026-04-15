import { ipcMain, BrowserWindow, app, dialog, shell, webContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { spawnPty, spawnShellPty, writePty, resizePty, killPty, isSilencedExit, getPtyCwd } from './pty-manager';
import { addMcpServer, removeMcpServer } from './claude-cli';
import type { McpServerConfig } from './claude-cli';
import { loadState, saveState, PersistedState } from './store';
import { startWatching, cleanupSessionStatus } from './hook-status';
import { startCodexSessionWatcher, registerPendingCodexSession, unregisterCodexSession } from './codex-session-watcher';
import { startBlackboxSessionWatcher, registerPendingBlackboxSession, unregisterBlackboxSession } from './blackbox-session-watcher';
import { getGitStatus, getGitFiles, getGitDiff, getGitWorktrees, gitStageFile, gitUnstageFile, gitDiscardFile, getGitRemoteUrl, listGitBranches, checkoutGitBranch, createGitBranch } from './git-status';
import { startGitWatcher, notifyGitChanged } from './git-watcher';
import { watchFile as watchFileForChanges, unwatchFile as unwatchFileForChanges, setFileWatcherWindow } from './file-watcher';
import { registerMcpHandlers } from './mcp-ipc-handlers';
import { checkForUpdates, quitAndInstall } from './auto-updater';
import { createAppMenu } from './menu';
import { getProvider, getProviderMeta, getAllProviderMetas } from './providers/registry';
import { buildHandoffPrompt } from './providers/resume-handoff';
import type { ProviderId, GitFileEntry, SettingsValidationResult } from '../shared/types';
import { expandUserPath } from './fs-utils';
import { isMac, isWin } from './platform';
import { discoverLocalBrowserTargets } from './local-dev-targets';
import { isTrackingHealthy } from '../shared/tracking-health';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';
import { discoverCliSurface } from './cli-surface-discovery';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { discoverProjectContext } from './calder-context/discovery';
import {
  createProjectContextStarterFiles,
  createProjectContextRuleFile,
  deleteProjectContextRuleFile,
  renameProjectContextRuleFile,
} from './calder-context/scaffold';
import { startProjectContextWatcher } from './calder-context/watcher';
import { discoverProjectWorkflows } from './calder-workflows/discovery';
import {
  createProjectWorkflowFile,
  createProjectWorkflowStarterFiles,
} from './calder-workflows/scaffold';
import { readProjectWorkflowFile } from './calder-workflows/read';
import { startProjectWorkflowWatcher } from './calder-workflows/watcher';
import { discoverProjectTeamContext } from './calder-team-context/discovery';
import {
  createProjectTeamContextSpaceFile,
  createProjectTeamContextStarterFiles,
} from './calder-team-context/scaffold';
import { startProjectTeamContextWatcher } from './calder-team-context/watcher';
import { discoverProjectReviews } from './calder-reviews/discovery';
import { createProjectReviewFile } from './calder-reviews/scaffold';
import { readProjectReviewFile } from './calder-reviews/read';
import { startProjectReviewWatcher } from './calder-reviews/watcher';
import { discoverProjectGovernance } from './calder-governance/discovery';
import { createProjectGovernanceStarterPolicy } from './calder-governance/scaffold';
import { startProjectGovernanceWatcher } from './calder-governance/watcher';
import { assertProjectGovernanceAllows } from './calder-governance/enforcement';
import { createAutoApprovalOrchestrator } from './calder-governance/auto-approval-orchestrator';
import { discoverProjectBackgroundTasks } from './calder-tasks/discovery';
import { createProjectBackgroundTaskFile } from './calder-tasks/scaffold';
import { readProjectBackgroundTaskFile } from './calder-tasks/read';
import { startProjectBackgroundTaskWatcher } from './calder-tasks/watcher';
import { discoverProjectCheckpoints } from './calder-checkpoints/discovery';
import { createProjectCheckpointFile, readProjectCheckpointFile } from './calder-checkpoints/scaffold';
import { startProjectCheckpointWatcher } from './calder-checkpoints/watcher';

/**
 * Check if a resolved path is within one of the known project directories.
 */
function isWithinKnownProject(resolvedPath: string): boolean {
  const state = loadState();
  return state.projects.some(p => resolvedPath.startsWith(p.path + path.sep) || resolvedPath === p.path);
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

let hookWatcherStarted = false;
let currentProjectContextPath: string | null = null;
let currentProjectContextWindow: BrowserWindow | null = null;
let currentProjectWorkflowPath: string | null = null;
let currentProjectWorkflowWindow: BrowserWindow | null = null;
let currentProjectTeamContextPath: string | null = null;
let currentProjectTeamContextWindow: BrowserWindow | null = null;
let currentProjectReviewPath: string | null = null;
let currentProjectReviewWindow: BrowserWindow | null = null;
let currentProjectGovernancePath: string | null = null;
let currentProjectGovernanceWindow: BrowserWindow | null = null;
let currentProjectBackgroundTaskPath: string | null = null;
let currentProjectBackgroundTaskWindow: BrowserWindow | null = null;
let currentProjectCheckpointPath: string | null = null;
let currentProjectCheckpointWindow: BrowserWindow | null = null;
const cliSurfaceRuntime = createCliSurfaceRuntimeManager({
  data: (projectId, data) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:data', projectId, data),
  exit: (projectId, exitCode, signal) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:exit', projectId, exitCode, signal),
  status: (projectId, state) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:status', projectId, state),
  error: (projectId, message) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:error', projectId, message),
});

export function resetHookWatcher(): void {
  hookWatcherStarted = false;
}

export function registerIpcHandlers(): void {
  const autoApprovalOrchestrator = createAutoApprovalOrchestrator({
    sendApproval: (sessionId, providerId) => {
      writePty(sessionId, providerId === 'codex' ? '1\n' : '\n');
    },
    emitInspectorEvents: (sessionId, events) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('session:inspectorEvents', sessionId, events);
      }
    },
  });
  const bridgedInspectorWebContents = new Set<number>();

  const ensureInspectorBridge = (win: BrowserWindow): void => {
    const contents = win.webContents;
    if (bridgedInspectorWebContents.has(contents.id)) return;
    bridgedInspectorWebContents.add(contents.id);

    const originalSend = contents.send.bind(contents);
    (contents as unknown as { send: typeof contents.send }).send = ((channel: string, ...args: unknown[]) => {
      originalSend(channel, ...args);
      if (channel !== 'session:inspectorEvents') return;

      const [sessionId, events] = args;
      if (typeof sessionId !== 'string' || !Array.isArray(events)) return;
      void autoApprovalOrchestrator.handleInspectorEvents(sessionId, events).catch((error) => {
        console.warn('Auto-approval orchestrator failed:', error);
      });
    }) as typeof contents.send;
  };

  ipcMain.handle('pty:create', (_event, sessionId: string, cwd: string, cliSessionId: string | null, isResume: boolean, extraArgs: string, providerId: ProviderId = 'claude', initialPrompt?: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    ensureInspectorBridge(win);

    // Start hook status watcher on first PTY creation (window is guaranteed to exist)
    if (!hookWatcherStarted) {
      startWatching(win);
      hookWatcherStarted = true;
    }
    autoApprovalOrchestrator.registerSession(sessionId, providerId, cwd);

    // Validate provider settings and warn renderer if missing/tampered
    const provider = getProvider(providerId);
    if (provider.meta.capabilities.hookStatus) {
      const validation = provider.validateSettings();
      if (!isTrackingHealthy(provider.meta, validation)) {
        win.webContents.send('settings:warning', {
          sessionId,
          providerId,
          statusLine: validation.statusLine,
          hooks: validation.hooks,
        });
      }
    }

    // For Codex sessions without a cliSessionId, start watching history.jsonl
    if (providerId === 'codex' && !cliSessionId) {
      startCodexSessionWatcher(win);
      registerPendingCodexSession(sessionId);
    }

    if (providerId === 'blackbox' && !cliSessionId) {
      startBlackboxSessionWatcher(win);
      registerPendingBlackboxSession(sessionId);
    }

    spawnPty(
      sessionId,
      cwd,
      cliSessionId,
      isResume,
      extraArgs,
      providerId,
      initialPrompt,
      (data) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:data', sessionId, data);
        }
      },
      (exitCode, signal) => {
        cleanupSessionStatus(sessionId);
        unregisterCodexSession(sessionId);
        unregisterBlackboxSession(sessionId);
        autoApprovalOrchestrator.unregisterSession(sessionId);
        if (isSilencedExit(sessionId)) return; // old PTY killed for re-spawn
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:exit', sessionId, exitCode, signal);
        }
      }
    );
  });

  ipcMain.handle('pty:createShell', (_event, sessionId: string, cwd: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    spawnShellPty(
      sessionId,
      cwd,
      (data) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:data', sessionId, data);
        }
      },
      (exitCode, signal) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:exit', sessionId, exitCode, signal);
        }
      }
    );
  });

  ipcMain.on('pty:write', (_event, sessionId: string, data: string) => {
    writePty(sessionId, data);
  });

  ipcMain.on('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizePty(sessionId, cols, rows);
  });

  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    autoApprovalOrchestrator.unregisterSession(sessionId);
    killPty(sessionId);
  });

  ipcMain.handle('cli-surface:start', (_event, projectId: string, profile) => {
    cliSurfaceRuntime.start(projectId, profile);
  });

  ipcMain.handle('cli-surface:discover', (_event, projectPath: string) => {
    return discoverCliSurface(projectPath);
  });

  ipcMain.handle('cli-surface:stop', (_event, projectId: string) => {
    cliSurfaceRuntime.stop(projectId);
  });

  ipcMain.handle('cli-surface:restart', (_event, projectId: string) => {
    cliSurfaceRuntime.restart(projectId);
  });

  ipcMain.on('cli-surface:write', (_event, projectId: string, data: string) => {
    cliSurfaceRuntime.write(projectId, data);
  });

  ipcMain.on('cli-surface:resize', (_event, projectId: string, cols: number, rows: number) => {
    cliSurfaceRuntime.resize(projectId, cols, rows);
  });

  ipcMain.handle('fs:isDirectory', (_event, filePath: string) => {
    try {
      return fs.statSync(expandUserPath(filePath)).isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:expandPath', (_event, filePath: string): string => {
    return expandUserPath(filePath);
  });

  ipcMain.handle('fs:listDirs', (_event, dirPath: string, prefix?: string) => {
    try {
      const expanded = expandUserPath(dirPath);
      const entries = fs.readdirSync(expanded, { withFileTypes: true });
      const lowerPrefix = prefix?.toLowerCase();
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && (!lowerPrefix || e.name.toLowerCase().startsWith(lowerPrefix)))
        .map(e => path.join(expanded, e.name))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 20);
    } catch {
      return [];
    }
  });

  ipcMain.handle('store:load', () => {
    return loadState();
  });

  ipcMain.handle('store:save', (_event, state: PersistedState) => {
    saveState(state);
  });

  ipcMain.handle('menu:rebuild', (_event, debugMode: boolean) => {
    createAppMenu(debugMode);
  });

  ipcMain.handle('provider:getConfig', async (_event, providerId: ProviderId, projectPath: string) => {
    const provider = getProvider(providerId);
    return provider.getConfig(projectPath);
  });

  // Backward compatibility alias
  ipcMain.handle('claude:getConfig', async (_event, projectPath: string) => {
    const provider = getProvider('claude');
    return provider.getConfig(projectPath);
  });

  ipcMain.on('config:watchProject', (_event, providerId: ProviderId, projectPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const provider = getProvider(providerId);
    provider.startConfigWatcher?.(win, projectPath);
  });

  ipcMain.handle('context:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectContext(projectPath);
  });

  ipcMain.handle('context:createStarterFiles', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create context starter files' });
    return createProjectContextStarterFiles(projectPath);
  });

  ipcMain.handle('context:createSharedRule', async (_event, projectPath: string, title: string, priority: 'hard' | 'soft') => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create shared context rule' });
    return createProjectContextRuleFile(projectPath, title, priority);
  });

  ipcMain.handle('context:renameSharedRule', async (_event, projectPath: string, relativePath: string, title: string, priority: 'hard' | 'soft') => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Rename shared context rule' });
    return renameProjectContextRuleFile(projectPath, relativePath, title, priority);
  });

  ipcMain.handle('context:deleteSharedRule', async (_event, projectPath: string, relativePath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Delete shared context rule' });
    return deleteProjectContextRuleFile(projectPath, relativePath);
  });

  ipcMain.handle('workflow:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectWorkflows(projectPath);
  });

  ipcMain.handle('workflow:createStarterFiles', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create workflow starter files' });
    return createProjectWorkflowStarterFiles(projectPath);
  });

  ipcMain.handle('workflow:createFile', async (_event, projectPath: string, title: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create workflow file' });
    return createProjectWorkflowFile(projectPath, title);
  });

  ipcMain.handle('workflow:readFile', async (_event, projectPath: string, workflowPath: string) => {
    return readProjectWorkflowFile(projectPath, workflowPath);
  });

  ipcMain.handle('teamContext:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectTeamContext(projectPath);
  });

  ipcMain.handle('teamContext:createStarterFiles', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create team context starter spaces' });
    return createProjectTeamContextStarterFiles(projectPath);
  });

  ipcMain.handle('teamContext:createSpace', async (_event, projectPath: string, title: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create team context space' });
    return createProjectTeamContextSpaceFile(projectPath, title);
  });

  ipcMain.handle('review:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectReviews(projectPath);
  });

  ipcMain.handle('review:createFile', async (_event, projectPath: string, title: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create review findings file' });
    return createProjectReviewFile(projectPath, title);
  });

  ipcMain.handle('review:readFile', async (_event, projectPath: string, reviewPath: string) => {
    return readProjectReviewFile(projectPath, reviewPath);
  });

  ipcMain.handle('governance:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectGovernance(projectPath);
  });

  ipcMain.handle('governance:createStarterPolicy', async (_event, projectPath: string) => {
    return createProjectGovernanceStarterPolicy(projectPath);
  });

  ipcMain.handle('task:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectBackgroundTasks(projectPath);
  });

  ipcMain.handle('task:create', async (_event, projectPath: string, title: string, prompt: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create background task' });
    return createProjectBackgroundTaskFile(projectPath, title, prompt);
  });

  ipcMain.handle('task:read', async (_event, projectPath: string, taskPath: string) => {
    return readProjectBackgroundTaskFile(projectPath, taskPath);
  });

  ipcMain.handle('checkpoint:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectCheckpoints(projectPath);
  });

  ipcMain.handle('checkpoint:create', async (_event, projectPath: string, snapshot) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create checkpoint' });
    return createProjectCheckpointFile(projectPath, snapshot);
  });

  ipcMain.handle('checkpoint:read', async (_event, projectPath: string, checkpointPath: string) => {
    return readProjectCheckpointFile(projectPath, checkpointPath);
  });

  ipcMain.on('context:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectContextPath && win === currentProjectContextWindow) return;
    currentProjectContextPath = projectPath;
    currentProjectContextWindow = win;
    startProjectContextWatcher(projectPath, (state) => {
      if (currentProjectContextWindow && !currentProjectContextWindow.isDestroyed()) {
        currentProjectContextWindow.webContents.send('context:changed', projectPath, state);
      }
    });
  });

  ipcMain.on('workflow:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectWorkflowPath && win === currentProjectWorkflowWindow) return;
    currentProjectWorkflowPath = projectPath;
    currentProjectWorkflowWindow = win;
    startProjectWorkflowWatcher(projectPath, (state) => {
      if (currentProjectWorkflowWindow && !currentProjectWorkflowWindow.isDestroyed()) {
        currentProjectWorkflowWindow.webContents.send('workflow:changed', projectPath, state);
      }
    });
  });

  ipcMain.on('teamContext:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectTeamContextPath && win === currentProjectTeamContextWindow) return;
    currentProjectTeamContextPath = projectPath;
    currentProjectTeamContextWindow = win;
    startProjectTeamContextWatcher(projectPath, (state) => {
      if (currentProjectTeamContextWindow && !currentProjectTeamContextWindow.isDestroyed()) {
        currentProjectTeamContextWindow.webContents.send('teamContext:changed', projectPath, state);
      }
    });
  });

  ipcMain.on('review:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectReviewPath && win === currentProjectReviewWindow) return;
    currentProjectReviewPath = projectPath;
    currentProjectReviewWindow = win;
    startProjectReviewWatcher(projectPath, (state) => {
      if (currentProjectReviewWindow && !currentProjectReviewWindow.isDestroyed()) {
        currentProjectReviewWindow.webContents.send('review:changed', projectPath, state);
      }
    });
  });

  ipcMain.on('governance:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectGovernancePath && win === currentProjectGovernanceWindow) return;
    currentProjectGovernancePath = projectPath;
    currentProjectGovernanceWindow = win;
    startProjectGovernanceWatcher(projectPath, (state) => {
      if (currentProjectGovernanceWindow && !currentProjectGovernanceWindow.isDestroyed()) {
        currentProjectGovernanceWindow.webContents.send('governance:changed', projectPath, state);
      }
    });
  });

  ipcMain.on('task:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectBackgroundTaskPath && win === currentProjectBackgroundTaskWindow) return;
    currentProjectBackgroundTaskPath = projectPath;
    currentProjectBackgroundTaskWindow = win;
    startProjectBackgroundTaskWatcher(projectPath, (state) => {
      if (currentProjectBackgroundTaskWindow && !currentProjectBackgroundTaskWindow.isDestroyed()) {
        currentProjectBackgroundTaskWindow.webContents.send('task:changed', projectPath, state);
      }
    });
  });

  ipcMain.on('checkpoint:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (projectPath === currentProjectCheckpointPath && win === currentProjectCheckpointWindow) return;
    currentProjectCheckpointPath = projectPath;
    currentProjectCheckpointWindow = win;
    startProjectCheckpointWatcher(projectPath, (state) => {
      if (currentProjectCheckpointWindow && !currentProjectCheckpointWindow.isDestroyed()) {
        currentProjectCheckpointWindow.webContents.send('checkpoint:changed', projectPath, state);
      }
    });
  });

  ipcMain.handle('provider:getMeta', (_event, providerId: ProviderId) => {
    return getProviderMeta(providerId);
  });

  ipcMain.handle('provider:listProviders', () => {
    return getAllProviderMetas();
  });

  ipcMain.handle('session:buildResumeWithPrompt', async (
    _event,
    sourceProviderId: ProviderId,
    sourceCliSessionId: string | null,
    projectPath: string,
    sessionName: string,
  ) => {
    const sourceProvider = getProvider(sourceProviderId);
    const fromProviderLabel = sourceProvider.meta.displayName;
    let transcriptPath: string | null = null;
    if (sourceCliSessionId && sourceProvider.getTranscriptPath) {
      try {
        transcriptPath = sourceProvider.getTranscriptPath(sourceCliSessionId, projectPath);
      } catch (err) {
        console.warn('getTranscriptPath failed:', err);
      }
    }
    return buildHandoffPrompt({ fromProviderLabel, sessionName, transcriptPath });
  });

  ipcMain.handle('provider:checkBinary', (_event, providerId: ProviderId = 'claude') => {
    const provider = getProvider(providerId);
    return provider.validatePrerequisites();
  });

  ipcMain.handle('fs:browseDirectory', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.on('app:focus', () => {
    app.focus({ steal: true });
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getBrowserPreloadPath', () =>
    path.join(__dirname, '..', '..', 'preload', 'preload', 'browser-tab-preload.js')
  );
  ipcMain.handle('app:sendToGuestWebContents', (_event, webContentsId: number, channel: string, ...args: unknown[]) => {
    const guest = webContents.fromId(webContentsId);
    if (!guest || guest.isDestroyed()) return false;
    guest.send(channel, ...args);
    return true;
  });

  const MAX_SCREENSHOT_BYTES = 50 * 1024 * 1024;
  const MAX_SCREENSHOT_B64_LEN = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3);
  const SCREENSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  let screenshotsPruned = false;

  async function pruneOldScreenshots(dir: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dir);
      const now = Date.now();
      await Promise.all(entries.map(async (name) => {
        const full = path.join(dir, name);
        try {
          const stat = await fs.promises.stat(full);
          if (now - stat.mtimeMs > SCREENSHOT_MAX_AGE_MS) {
            await fs.promises.unlink(full);
          }
        } catch (err) {
          console.warn('Failed to prune screenshot', full, err);
        }
      }));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to read screenshots dir for pruning', err);
      }
    }
  }

  ipcMain.handle('browser:saveScreenshot', async (_event, sessionId: string, dataUrl: string) => {
    const PREFIX = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) {
      throw new Error('Invalid screenshot data URL');
    }
    const b64 = dataUrl.slice(PREFIX.length);
    if (b64.length > MAX_SCREENSHOT_B64_LEN) {
      throw new Error('Screenshot data exceeds size limit');
    }
    const buffer = Buffer.from(b64, 'base64');
    const dir = path.join(os.tmpdir(), 'calder-screenshots');
    await fs.promises.mkdir(dir, { recursive: true });
    if (!screenshotsPruned) {
      screenshotsPruned = true;
      void pruneOldScreenshots(dir);
    }
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, `draw-${safeId}-${Date.now()}.png`);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  });
  ipcMain.handle('browser:listLocalTargets', async () => discoverLocalBrowserTargets());
  ipcMain.handle('app:openExternal', (_event, url: string, cwd?: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP(S) URLs are allowed');
    }
    const win = BrowserWindow.getAllWindows()[0];
    return openUrlWithBrowserPolicy({ url, cwd, preferEmbedded: true }, win, (target) => shell.openExternal(target));
  });

  ipcMain.handle('git:getStatus', (_event, projectPath: string) => getGitStatus(projectPath));

  ipcMain.handle('git:getRemoteUrl', (_event, projectPath: string) => getGitRemoteUrl(projectPath));

  ipcMain.handle('git:getFiles', (_event, projectPath: string) => getGitFiles(projectPath));

  ipcMain.handle('git:getDiff', (_event, projectPath: string, filePath: string, area: string) => getGitDiff(projectPath, filePath, area));

  ipcMain.handle('git:getWorktrees', (_event, projectPath: string) => getGitWorktrees(projectPath));

  ipcMain.handle('git:stageFile', async (_event, projectPath: string, filePath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Stage git file' });
    await gitStageFile(projectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:unstageFile', async (_event, projectPath: string, filePath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Unstage git file' });
    await gitUnstageFile(projectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:discardFile', async (_event, projectPath: string, filePath: string, area: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Discard git file changes' });
    await gitDiscardFile(projectPath, filePath, area as GitFileEntry['area']);
    notifyGitChanged();
  });

  ipcMain.on('git:watchProject', (_event, projectPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    startGitWatcher(win, projectPath);
  });

  ipcMain.handle('git:listBranches', (_event, projectPath: string) => listGitBranches(projectPath));

  ipcMain.handle('git:checkoutBranch', async (_event, projectPath: string, branch: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Checkout git branch' });
    await checkoutGitBranch(projectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:createBranch', async (_event, projectPath: string, branch: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create git branch' });
    await createGitBranch(projectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:openInEditor', (_event, projectPath: string, filePath: string) => {
    const fullPath = path.join(projectPath, filePath);
    return shell.openPath(fullPath);
  });

  ipcMain.handle('pty:getCwd', (_event, sessionId: string) => getPtyCwd(sessionId));

  ipcMain.handle('fs:listFiles', (_event, cwd: string, query: string) => {
    try {
      const resolvedCwd = path.resolve(cwd);
      if (!isWithinKnownProject(resolvedCwd)) {
        return [];
      }
      let files: string[];
      try {
        const output = execSync('git ls-files --cached --others --exclude-standard', {
          cwd: resolvedCwd,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        files = output.split('\n').filter(Boolean);
      } catch {
        // Not a git repo — fallback to recursive readdir with depth limit
        files = [];
        const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__']);
        const MAX_DEPTH = 5;
        const MAX_FILES = 5000;
        function walk(dir: string, depth: number): void {
          if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
          let entries: fs.Dirent[];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
          for (const entry of entries) {
            if (files.length >= MAX_FILES) return;
            if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;
            const rel = path.relative(resolvedCwd, path.join(dir, entry.name));
            if (entry.isDirectory()) {
              walk(path.join(dir, entry.name), depth + 1);
            } else {
              files.push(rel);
            }
          }
        }
        walk(resolvedCwd, 0);
      }

      if (query) {
        const lower = query.toLowerCase();
        const exact: string[] = [];
        const startsWith: string[] = [];
        const nameContains: string[] = [];
        const pathContains: string[] = [];
        for (const f of files) {
          const fileName = path.basename(f).toLowerCase();
          if (fileName === lower) exact.push(f);
          else if (fileName.startsWith(lower)) startsWith.push(f);
          else if (fileName.includes(lower)) nameContains.push(f);
          else if (f.toLowerCase().includes(lower)) pathContains.push(f);
        }
        files = [...exact, ...startsWith, ...nameContains, ...pathContains];
      }
      return files.slice(0, 50);
    } catch (err) {
      console.warn('fs:listFiles failed:', err);
      return [];
    }
  });

  ipcMain.handle('fs:readFile', (_event, filePath: string) => {
    try {
      // Security: resolve to absolute and check it's within a known project directory
      const resolved = path.resolve(filePath);
      if (!isAllowedReadPath(resolved)) {
        console.warn(`fs:readFile blocked: ${resolved} is not within an allowed path`);
        return '';
      }
      return fs.readFileSync(resolved, 'utf-8');
    } catch (err) {
      console.warn('fs:readFile failed:', err);
      return '';
    }
  });

  ipcMain.on('fs:watchFile', (event, filePath: string) => {
    const resolved = path.resolve(filePath);
    if (!isAllowedReadPath(resolved)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) setFileWatcherWindow(win);
    watchFileForChanges(resolved);
  });

  ipcMain.on('fs:unwatchFile', (_event, filePath: string) => {
    const resolved = path.resolve(filePath);
    unwatchFileForChanges(resolved);
  });

  ipcMain.handle('stats:getCache', () => {
    try {
      const statsPath = path.join(os.homedir(), '.claude', 'stats-cache.json');
      const raw = fs.readFileSync(statsPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle('update:checkNow', () => checkForUpdates());
  ipcMain.handle('update:install', () => quitAndInstall());

  ipcMain.handle('settings:reinstall', (_event, providerId: ProviderId = 'claude') => {
    try {
      const provider = getProvider(providerId);
      provider.reinstallSettings();
      const validation = provider.validateSettings();
      return { success: isTrackingHealthy(provider.meta, validation) };
    } catch (err) {
      console.error('settings:reinstall failed:', err);
      return { success: false };
    }
  });

  ipcMain.handle('settings:validate', (_event, providerId: ProviderId = 'claude'): SettingsValidationResult => {
    const provider = getProvider(providerId);
    return provider.validateSettings();
  });

  ipcMain.handle('mcp:addServer', async (_event, name: string, config: McpServerConfig, scope: 'user' | 'project', projectPath?: string) => {
    try {
      if (scope === 'project' && projectPath) {
        await assertProjectGovernanceAllows(projectPath, { kind: 'mcp', label: 'Add project MCP server', target: name });
      }
      addMcpServer(name, config, scope, projectPath);
      return { success: true };
    } catch (err) {
      console.error('mcp:addServer failed:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('mcp:removeServer', (_event, name: string, filePath: string, scope: 'user' | 'project', projectPath?: string) => {
    try {
      removeMcpServer(name, filePath, scope, projectPath);
      return { success: true };
    } catch (err) {
      console.error('mcp:removeServer failed:', err);
      return { success: false, error: String(err) };
    }
  });

  registerMcpHandlers();
}
