import { ipcMain, BrowserWindow, dialog } from 'electron';
import type { AutoApprovalMode, ProjectGovernanceState } from '../shared/types';
import { discoverProjectContext } from './calder-context/discovery';
import {
  createProjectContextStarterFiles,
  createProjectContextRuleFile,
  deleteProjectContextRuleFile,
  renameProjectContextRuleFile,
} from './calder-context/scaffold';
import { startProjectContextWatcher, stopProjectContextWatcher } from './calder-context/watcher';
import { discoverProjectWorkflows } from './calder-workflows/discovery';
import {
  createProjectWorkflowFile,
  createProjectWorkflowStarterFiles,
} from './calder-workflows/scaffold';
import { readProjectWorkflowFile } from './calder-workflows/read';
import { startProjectWorkflowWatcher, stopProjectWorkflowWatcher } from './calder-workflows/watcher';
import { discoverProjectTeamContext } from './calder-team-context/discovery';
import {
  createProjectTeamContextSpaceFile,
  createProjectTeamContextStarterFiles,
} from './calder-team-context/scaffold';
import { startProjectTeamContextWatcher } from './calder-team-context/watcher';
import { discoverProjectReviews } from './calder-reviews/discovery';
import { createProjectReviewFile } from './calder-reviews/scaffold';
import { readProjectReviewFile } from './calder-reviews/read';
import { startProjectReviewWatcher, stopProjectReviewWatcher } from './calder-reviews/watcher';
import { createProjectGovernanceStarterPolicy } from './calder-governance/scaffold';
import { startProjectGovernanceWatcher, stopProjectGovernanceWatcher } from './calder-governance/watcher';
import type { ProjectGovernanceOperation } from './calder-governance/enforcement';
import { discoverProjectBackgroundTasks } from './calder-tasks/discovery';
import { createProjectBackgroundTaskFile } from './calder-tasks/scaffold';
import { readProjectBackgroundTaskFile } from './calder-tasks/read';
import { startProjectBackgroundTaskWatcher, stopProjectBackgroundTaskWatcher } from './calder-tasks/watcher';
import { discoverProjectCheckpoints } from './calder-checkpoints/discovery';
import { createProjectCheckpointFile, readProjectCheckpointFile } from './calder-checkpoints/scaffold';
import { startProjectCheckpointWatcher, stopProjectCheckpointWatcher } from './calder-checkpoints/watcher';

export interface CalderIpcOps {
  assertProjectGovernanceAllows: (projectPath: string, operation: ProjectGovernanceOperation) => Promise<void>;
  getGovernanceState: (projectPath: string, sessionId?: string) => Promise<ProjectGovernanceState>;
  isAutoApprovalMode: (value: unknown) => value is AutoApprovalMode;
  updateAutoApprovalMode: (projectPath: string, scope: 'global' | 'project', mode: AutoApprovalMode | null) => void;
  setSessionAutoApprovalOverride: (sessionId: string, mode: AutoApprovalMode | null) => void;
}

interface ProjectWatchBinding {
  projectPath: string;
  dispose: () => void;
  win: BrowserWindow;
  onWindowClosed: () => void;
}

const projectContextBindings = new Map<number, ProjectWatchBinding>();
const projectWorkflowBindings = new Map<number, ProjectWatchBinding>();
const projectTeamContextBindings = new Map<number, ProjectWatchBinding>();
const projectReviewBindings = new Map<number, ProjectWatchBinding>();
const projectGovernanceBindings = new Map<number, ProjectWatchBinding>();
const projectTaskBindings = new Map<number, ProjectWatchBinding>();
const projectCheckpointBindings = new Map<number, ProjectWatchBinding>();

function removeWindowClosedListener(win: BrowserWindow, listener: () => void): void {
  if (typeof win.off === 'function') {
    win.off('closed', listener);
    return;
  }
  win.removeListener('closed', listener);
}

function clearProjectBindings(bindings: Map<number, ProjectWatchBinding>): void {
  for (const binding of bindings.values()) {
    removeWindowClosedListener(binding.win, binding.onWindowClosed);
    binding.dispose();
  }
  bindings.clear();
}

function bindProjectWatcher<State>(
  bindings: Map<number, ProjectWatchBinding>,
  win: BrowserWindow,
  projectPath: string,
  start: (projectPath: string, onChange: (state: State) => void) => () => void,
  channel: string,
): void {
  const windowId = win.id;
  const existing = bindings.get(windowId);
  if (existing?.projectPath === projectPath) return;
  if (existing) {
    removeWindowClosedListener(existing.win, existing.onWindowClosed);
    existing.dispose();
    bindings.delete(windowId);
  }

  const dispose = start(projectPath, (state) => {
    const targetWindow = BrowserWindow.fromId(windowId);
    if (!targetWindow || targetWindow.isDestroyed()) return;
    targetWindow.webContents.send(channel, projectPath, state);
  });

  const onWindowClosed = () => {
    const current = bindings.get(windowId);
    if (!current || current.dispose !== dispose) return;
    current.dispose();
    bindings.delete(windowId);
  };
  bindings.set(windowId, { projectPath, dispose, win, onWindowClosed });
  win.once('closed', onWindowClosed);
}

export function resetCalderProjectWatchers(): void {
  stopProjectContextWatcher();
  stopProjectWorkflowWatcher();
  stopProjectReviewWatcher();
  stopProjectGovernanceWatcher();
  stopProjectBackgroundTaskWatcher();
  stopProjectCheckpointWatcher();

  clearProjectBindings(projectContextBindings);
  clearProjectBindings(projectWorkflowBindings);
  clearProjectBindings(projectTeamContextBindings);
  clearProjectBindings(projectReviewBindings);
  clearProjectBindings(projectGovernanceBindings);
  clearProjectBindings(projectTaskBindings);
  clearProjectBindings(projectCheckpointBindings);
}

export function registerCalderIpcHandlers(ops: CalderIpcOps): void {
  ipcMain.handle('context:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectContext(projectPath);
  });

  ipcMain.handle('context:createStarterFiles', async (_event, projectPath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create context starter files' });
    return createProjectContextStarterFiles(projectPath);
  });

  ipcMain.handle('context:createSharedRule', async (_event, projectPath: string, title: string, priority: 'hard' | 'soft') => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create shared context rule' });
    return createProjectContextRuleFile(projectPath, title, priority);
  });

  ipcMain.handle('context:renameSharedRule', async (_event, projectPath: string, relativePath: string, title: string, priority: 'hard' | 'soft') => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Rename shared context rule' });
    return renameProjectContextRuleFile(projectPath, relativePath, title, priority);
  });

  ipcMain.handle('context:deleteSharedRule', async (_event, projectPath: string, relativePath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Delete shared context rule' });
    return deleteProjectContextRuleFile(projectPath, relativePath);
  });

  ipcMain.handle('workflow:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectWorkflows(projectPath);
  });

  ipcMain.handle('workflow:createStarterFiles', async (_event, projectPath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create workflow starter files' });
    return createProjectWorkflowStarterFiles(projectPath);
  });

  ipcMain.handle('workflow:createFile', async (_event, projectPath: string, title: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create workflow file' });
    return createProjectWorkflowFile(projectPath, title);
  });

  ipcMain.handle('workflow:readFile', async (_event, projectPath: string, workflowPath: string) => {
    return readProjectWorkflowFile(projectPath, workflowPath);
  });

  ipcMain.handle('teamContext:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectTeamContext(projectPath);
  });

  ipcMain.handle('teamContext:createStarterFiles', async (_event, projectPath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create team context starter spaces' });
    return createProjectTeamContextStarterFiles(projectPath);
  });

  ipcMain.handle('teamContext:createSpace', async (_event, projectPath: string, title: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create team context space' });
    return createProjectTeamContextSpaceFile(projectPath, title);
  });

  ipcMain.handle('review:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectReviews(projectPath);
  });

  ipcMain.handle('review:createFile', async (_event, projectPath: string, title: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create review findings file' });
    return createProjectReviewFile(projectPath, title);
  });

  ipcMain.handle('review:readFile', async (_event, projectPath: string, reviewPath: string) => {
    return readProjectReviewFile(projectPath, reviewPath);
  });

  ipcMain.handle('governance:getProjectState', async (_event, projectPath: string, sessionId?: string) => {
    return ops.getGovernanceState(projectPath, sessionId);
  });

  ipcMain.handle('governance:createStarterPolicy', async (_event, projectPath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create governance starter policy' });
    return createProjectGovernanceStarterPolicy(projectPath);
  });

  ipcMain.handle(
    'governance:setAutoApprovalMode',
    async (
      _event,
      projectPath: string,
      scope: 'global' | 'project',
      mode: AutoApprovalMode | null,
      sessionId?: string,
    ) => {
      const validGlobalPayload = scope === 'global' && ops.isAutoApprovalMode(mode);
      const validProjectPayload = scope === 'project' && (mode === null || ops.isAutoApprovalMode(mode));
      if (!validGlobalPayload && !validProjectPayload) {
        throw new Error('Invalid auto-approval update payload.');
      }
      ops.updateAutoApprovalMode(projectPath, scope, mode);
      return ops.getGovernanceState(projectPath, sessionId);
    },
  );

  ipcMain.handle(
    'governance:setSessionAutoApprovalOverride',
    async (_event, sessionId: string, mode: AutoApprovalMode | null) => {
      if (mode !== null && !ops.isAutoApprovalMode(mode)) {
        throw new Error('Invalid session auto-approval override mode.');
      }
      ops.setSessionAutoApprovalOverride(sessionId, mode);
      return { ok: true };
    },
  );

  ipcMain.handle('task:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectBackgroundTasks(projectPath);
  });

  ipcMain.handle('task:create', async (_event, projectPath: string, title: string, prompt: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create background task' });
    return createProjectBackgroundTaskFile(projectPath, title, prompt);
  });

  ipcMain.handle('task:read', async (_event, projectPath: string, taskPath: string) => {
    return readProjectBackgroundTaskFile(projectPath, taskPath);
  });

  ipcMain.handle('checkpoint:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectCheckpoints(projectPath);
  });

  ipcMain.handle('checkpoint:create', async (_event, projectPath: string, snapshot) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create checkpoint' });
    return createProjectCheckpointFile(projectPath, snapshot);
  });

  ipcMain.handle('checkpoint:read', async (_event, projectPath: string, checkpointPath: string) => {
    return readProjectCheckpointFile(projectPath, checkpointPath);
  });

  ipcMain.on('context:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectContextBindings, win, projectPath, startProjectContextWatcher, 'context:changed');
  });

  ipcMain.on('workflow:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectWorkflowBindings, win, projectPath, startProjectWorkflowWatcher, 'workflow:changed');
  });

  ipcMain.on('teamContext:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectTeamContextBindings, win, projectPath, startProjectTeamContextWatcher, 'teamContext:changed');
  });

  ipcMain.on('review:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectReviewBindings, win, projectPath, startProjectReviewWatcher, 'review:changed');
  });

  ipcMain.on('governance:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectGovernanceBindings, win, projectPath, startProjectGovernanceWatcher, 'governance:changed');
  });

  ipcMain.on('task:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectTaskBindings, win, projectPath, startProjectBackgroundTaskWatcher, 'task:changed');
  });

  ipcMain.on('checkpoint:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectCheckpointBindings, win, projectPath, startProjectCheckpointWatcher, 'checkpoint:changed');
  });

  ipcMain.handle('fs:browseDirectory', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
