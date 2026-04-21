import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import { spawnPty, spawnShellPty, writePty, resizePty, killPty, isSilencedExit } from './pty-manager';
import type { ProviderId } from '../shared/types/provider';

export interface PtyIpcOps {
  isWithinKnownProject: (resolvedPath: string) => boolean;
  ensureHookWatcherStarted: (win: BrowserWindow) => void;
  registerAutoApprovalSession: (sessionId: string, providerId: ProviderId, cwd: string) => void;
  unregisterAutoApprovalSession: (sessionId: string) => void;
  validateProviderTrackingAndWarn: (win: BrowserWindow, sessionId: string, providerId: ProviderId) => void;
  registerPendingProviderSessionWatchers: (
    providerId: ProviderId,
    cliSessionId: string | null,
    sessionId: string,
    win: BrowserWindow,
  ) => void;
  mirrorPlaywrightFromPtyData: (sessionId: string, cwd: string, chunk: string) => void;
  handlePtySessionExit: (sessionId: string) => void;
}

export function registerPtyIpcHandlers(ops: PtyIpcOps): void {
  ipcMain.handle('pty:create', (_event, sessionId: string, cwd: string, cliSessionId: string | null, isResume: boolean, extraArgs: string, providerId: ProviderId = 'claude', initialPrompt?: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const resolvedCwd = path.resolve(cwd);
    if (!ops.isWithinKnownProject(resolvedCwd)) {
      throw new Error('PTY create requires a known project path');
    }

    ops.ensureHookWatcherStarted(win);
    ops.registerAutoApprovalSession(sessionId, providerId, resolvedCwd);
    ops.validateProviderTrackingAndWarn(win, sessionId, providerId);
    ops.registerPendingProviderSessionWatchers(providerId, cliSessionId, sessionId, win);

    spawnPty(
      sessionId,
      resolvedCwd,
      cliSessionId,
      isResume,
      extraArgs,
      providerId,
      initialPrompt,
      (data) => {
        ops.mirrorPlaywrightFromPtyData(sessionId, resolvedCwd, data);
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:data', sessionId, data);
        }
      },
      (exitCode, signal) => {
        ops.handlePtySessionExit(sessionId);
        if (isSilencedExit(sessionId)) return; // old PTY killed for re-spawn
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:exit', sessionId, exitCode, signal);
        }
      },
    );
  });

  ipcMain.handle('pty:createShell', (_event, sessionId: string, cwd: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const resolvedCwd = path.resolve(cwd);
    if (!ops.isWithinKnownProject(resolvedCwd)) {
      throw new Error('PTY shell requires a known project path');
    }

    spawnShellPty(
      sessionId,
      resolvedCwd,
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
      },
    );
  });

  ipcMain.on('pty:write', (_event, sessionId: string, data: string) => {
    writePty(sessionId, data);
  });

  ipcMain.on('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizePty(sessionId, cols, rows);
  });

  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    ops.unregisterAutoApprovalSession(sessionId);
    killPty(sessionId);
  });
}
