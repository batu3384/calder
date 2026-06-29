import { BrowserWindow, ipcMain, shell } from 'electron';

import type { GitFileEntry } from '../shared/types/project-core';
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
import { requireKnownProjectPath as requireKnownProjectPathFromPolicy } from './ipc-path-policy';
import { resolvePathWithinProject } from './project-path-security';

interface GitGovernanceOps {
  requireKnownProjectPath?: (projectPath: string, contextLabel: string) => string;
  assertProjectGovernanceAllows: (
    projectPath: string,
    operation: { kind: 'write'; label: string },
  ) => Promise<void>;
}

export function registerGitIpcHandlers(ops: GitGovernanceOps): void {
  const requireKnownProjectPath = ops.requireKnownProjectPath ?? requireKnownProjectPathFromPolicy;

  ipcMain.handle('git:getStatus', (_event, projectPath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Read git status');
    return getGitStatus(validatedProjectPath);
  });

  ipcMain.handle('git:getRemoteUrl', (_event, projectPath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Read git remote URL');
    return getGitRemoteUrl(validatedProjectPath);
  });

  ipcMain.handle('git:getFiles', (_event, projectPath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Read git files');
    return getGitFiles(validatedProjectPath);
  });

  ipcMain.handle('git:getDiff', (_event, projectPath: string, filePath: string, area: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Read git diff');
    return getGitDiff(validatedProjectPath, filePath, area);
  });

  ipcMain.handle('git:getWorktrees', (_event, projectPath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Read git worktrees');
    return getGitWorktrees(validatedProjectPath);
  });

  ipcMain.handle('git:stageFile', async (_event, projectPath: string, filePath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Stage git file');
    await ops.assertProjectGovernanceAllows(validatedProjectPath, {
      kind: 'write',
      label: 'Stage git file',
    });
    await gitStageFile(validatedProjectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:unstageFile', async (_event, projectPath: string, filePath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Unstage git file');
    await ops.assertProjectGovernanceAllows(validatedProjectPath, {
      kind: 'write',
      label: 'Unstage git file',
    });
    await gitUnstageFile(validatedProjectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle(
    'git:discardFile',
    async (_event, projectPath: string, filePath: string, area: string) => {
      const validatedProjectPath = requireKnownProjectPath(projectPath, 'Discard git file changes');
      await ops.assertProjectGovernanceAllows(validatedProjectPath, {
        kind: 'write',
        label: 'Discard git file changes',
      });
      await gitDiscardFile(validatedProjectPath, filePath, area as GitFileEntry['area']);
      notifyGitChanged();
    },
  );

  ipcMain.on('git:watchProject', (_event, projectPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    startGitWatcher(win, projectPath);
  });

  ipcMain.handle('git:listBranches', (_event, projectPath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'List git branches');
    return listGitBranches(validatedProjectPath);
  });

  ipcMain.handle('git:checkoutBranch', async (_event, projectPath: string, branch: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Checkout git branch');
    await ops.assertProjectGovernanceAllows(validatedProjectPath, {
      kind: 'write',
      label: 'Checkout git branch',
    });
    await checkoutGitBranch(validatedProjectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:createBranch', async (_event, projectPath: string, branch: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Create git branch');
    await ops.assertProjectGovernanceAllows(validatedProjectPath, {
      kind: 'write',
      label: 'Create git branch',
    });
    await createGitBranch(validatedProjectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:openInEditor', (_event, projectPath: string, filePath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Open file in editor');
    const fullPath = resolvePathWithinProject(validatedProjectPath, filePath);
    return shell.openPath(fullPath);
  });
}
