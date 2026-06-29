import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

import type { ProviderId } from '../shared/types/provider';
import type { ProjectGovernanceOperation } from './calder-governance/enforcement';
import {
  getPtyCwd,
  hasPtySession,
  isSilencedExit,
  killPty,
  resizePty,
  spawnPty,
  spawnShellPty,
  writePty,
} from './pty-manager';
import {
  validatePtyCreatePayload,
  validatePtyResizePayload,
  validatePtyWritePayload,
} from './validation/ipc-validation';

/** Simple in-memory rate limiter for pty:create per sessionId */
const ptyCreateRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX_CREATES = 10;

export interface PtyIpcOps {
  assertProjectGovernanceAllows: (
    projectPath: string,
    operation: ProjectGovernanceOperation,
  ) => Promise<void>;
  isWithinKnownProject: (resolvedPath: string) => boolean;
  ensureHookWatcherStarted: (win: BrowserWindow) => void;
  registerAutoApprovalSession: (sessionId: string, providerId: ProviderId, cwd: string) => void;
  unregisterAutoApprovalSession: (sessionId: string) => void;
  validateProviderTrackingAndWarn: (
    win: BrowserWindow,
    sessionId: string,
    providerId: ProviderId,
  ) => void;
  registerPendingProviderSessionWatchers: (
    providerId: ProviderId,
    cliSessionId: string | null,
    sessionId: string,
    cwd: string,
    win: BrowserWindow,
  ) => void;
  mirrorPlaywrightFromPtyData: (sessionId: string, cwd: string, chunk: string) => void;
  handlePtySessionExit: (sessionId: string) => void;
}

export function registerPtyIpcHandlers(ops: PtyIpcOps): void {
  ipcMain.handle(
    'pty:create',
    async (
      _event,
      sessionId: string,
      cwd: string,
      cliSessionId: string | null,
      isResume: boolean,
      extraArgs: string,
      providerId: ProviderId = 'claude',
      initialPrompt?: string,
    ) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) {
        throw new Error('PTY create requires an application window');
      }

      const payload = validatePtyCreatePayload(
        sessionId,
        cwd,
        cliSessionId,
        isResume,
        extraArgs,
        providerId,
        initialPrompt,
      );

      const now = Date.now();
      const entry = ptyCreateRateLimit.get(payload.sessionId);
      if (entry && now < entry.resetAt) {
        if (entry.count >= RATE_LIMIT_MAX_CREATES) {
          throw new Error('PTY create rate limit exceeded');
        }
        entry.count++;
      } else {
        ptyCreateRateLimit.set(payload.sessionId, {
          count: 1,
          resetAt: now + RATE_LIMIT_WINDOW_MS,
        });
      }

      const resolvedCwd = path.resolve(payload.cwd);
      if (!ops.isWithinKnownProject(resolvedCwd)) {
        throw new Error('PTY create requires a known project path');
      }

      await ops.assertProjectGovernanceAllows(resolvedCwd, {
        kind: 'write',
        label: 'Spawn CLI session',
      });

      ops.ensureHookWatcherStarted(win);
      ops.registerAutoApprovalSession(payload.sessionId, payload.providerId, resolvedCwd);
      ops.validateProviderTrackingAndWarn(win, payload.sessionId, payload.providerId);
      ops.registerPendingProviderSessionWatchers(
        payload.providerId,
        payload.cliSessionId,
        payload.sessionId,
        resolvedCwd,
        win,
      );

      spawnPty(
        payload.sessionId,
        resolvedCwd,
        payload.cliSessionId,
        payload.isResume,
        payload.extraArgs,
        payload.providerId,
        payload.initialPrompt,
        (data) => {
          ops.mirrorPlaywrightFromPtyData(payload.sessionId, resolvedCwd, data);
          const w = BrowserWindow.getAllWindows()[0];
          if (w && !w.isDestroyed()) {
            w.webContents.send('pty:data', payload.sessionId, data);
          }
        },
        (exitCode, signal) => {
          ops.handlePtySessionExit(payload.sessionId);
          if (isSilencedExit(payload.sessionId)) return; // old PTY killed for re-spawn
          const w = BrowserWindow.getAllWindows()[0];
          if (w && !w.isDestroyed()) {
            w.webContents.send('pty:exit', payload.sessionId, exitCode, signal);
          }
        },
      );
    },
  );

  ipcMain.handle('pty:createShell', async (_event, sessionId: string, cwd: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      throw new Error('PTY shell requires an application window');
    }
    const resolvedCwd = path.resolve(cwd);
    if (!ops.isWithinKnownProject(resolvedCwd)) {
      throw new Error('PTY shell requires a known project path');
    }

    await ops.assertProjectGovernanceAllows(resolvedCwd, {
      kind: 'write',
      label: 'Spawn shell session',
    });

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
    const payload = validatePtyWritePayload(sessionId, data);
    if (!hasPtySession(payload.sessionId)) {
      console.warn(`pty:write ignored unknown session: ${payload.sessionId}`);
      return;
    }
    writePty(payload.sessionId, payload.data);
  });

  ipcMain.on('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    const payload = validatePtyResizePayload(sessionId, cols, rows);
    resizePty(payload.sessionId, payload.cols, payload.rows);
  });

  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    ops.unregisterAutoApprovalSession(sessionId);
    killPty(sessionId);
  });

  ipcMain.handle('pty:getCwd', (_event, sessionId: string) => getPtyCwd(sessionId));
}
