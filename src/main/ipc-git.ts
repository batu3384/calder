import { BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import type { GitFileEntry } from '../shared/types';
import {
  checkoutGitBranch,
  createGitBranch,
  getGitDiff,
  getGitFiles,
  getGitRemoteUrl,
  getGitStatus,
  getGitWorktrees,
  gitDiscardFile,
  gitStageFile,
  gitUnstageFile,
  listGitBranches,
} from './git-status';
import { notifyGitChanged, startGitWatcher } from './git-watcher';

interface GitGovernanceOps {
  assertProjectGovernanceAllows: (
    projectPath: string,
    operation: { kind: 'write'; label: string },
  ) => Promise<void>;
}

export function registerGitIpcHandlers(ops: GitGovernanceOps): void {
  ipcMain.handle('git:getStatus', (_event, projectPath: string) => getGitStatus(projectPath));

  ipcMain.handle('git:getRemoteUrl', (_event, projectPath: string) => getGitRemoteUrl(projectPath));

  ipcMain.handle('git:getFiles', (_event, projectPath: string) => getGitFiles(projectPath));

  ipcMain.handle('git:getDiff', (_event, projectPath: string, filePath: string, area: string) => getGitDiff(projectPath, filePath, area));

  ipcMain.handle('git:getWorktrees', (_event, projectPath: string) => getGitWorktrees(projectPath));

  ipcMain.handle('git:stageFile', async (_event, projectPath: string, filePath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Stage git file' });
    await gitStageFile(projectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:unstageFile', async (_event, projectPath: string, filePath: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Unstage git file' });
    await gitUnstageFile(projectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:discardFile', async (_event, projectPath: string, filePath: string, area: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Discard git file changes' });
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
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Checkout git branch' });
    await checkoutGitBranch(projectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:createBranch', async (_event, projectPath: string, branch: string) => {
    await ops.assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create git branch' });
    await createGitBranch(projectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:openInEditor', (_event, projectPath: string, filePath: string) => {
    const fullPath = path.join(projectPath, filePath);
    return shell.openPath(fullPath);
  });
}
