import type { IpcRenderer } from 'electron';

import type { ProviderId } from '../shared/types/provider';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface PreloadPtyApi {
  create(
    sessionId: string,
    cwd: string,
    cliSessionId: string | null,
    isResume: boolean,
    extraArgs?: string,
    providerId?: ProviderId,
    initialPrompt?: string,
  ): Promise<void>;
  createShell(sessionId: string, cwd: string): Promise<void>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  kill(sessionId: string): Promise<void>;
  getCwd(sessionId: string): Promise<string | null>;
  onData(callback: (sessionId: string, data: string) => void): () => void;
  onExit(callback: (sessionId: string, exitCode: number, signal?: number) => void): () => void;
}

export function createPreloadPtyApi(ipcRenderer: IpcRenderer, onChannel: OnChannel): PreloadPtyApi {
  return {
    create: (sessionId, cwd, cliSessionId, isResume, extraArgs, providerId, initialPrompt) =>
      ipcRenderer.invoke(
        'pty:create',
        sessionId,
        cwd,
        cliSessionId,
        isResume,
        extraArgs || '',
        providerId || 'claude',
        initialPrompt,
      ),
    createShell: (sessionId, cwd) => ipcRenderer.invoke('pty:createShell', sessionId, cwd),
    write: (sessionId, data) => ipcRenderer.send('pty:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('pty:resize', sessionId, cols, rows),
    kill: (sessionId) => ipcRenderer.invoke('pty:kill', sessionId),
    getCwd: (sessionId: string) => ipcRenderer.invoke('pty:getCwd', sessionId),
    onData: (callback) =>
      onChannel('pty:data', (sessionId, data) => callback(sessionId as string, data as string)),
    onExit: (callback) =>
      onChannel('pty:exit', (sessionId, exitCode, signal) =>
        callback(sessionId as string, exitCode as number, signal as number | undefined),
      ),
  };
}
