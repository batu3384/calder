import type { IpcRenderer } from 'electron';
import type { CliSurfaceDiscoveryResult, CliSurfaceProfile, CliSurfaceRuntimeState } from '../shared/types/project';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface PreloadCliSurfaceApi {
  discover: (projectPath: string) => Promise<CliSurfaceDiscoveryResult>;
  start(projectId: string, profile: CliSurfaceProfile): Promise<void>;
  stop(projectId: string): Promise<void>;
  restart(projectId: string): Promise<void>;
  write(projectId: string, data: string): void;
  resize(projectId: string, cols: number, rows: number): void;
  onData(callback: (projectId: string, data: string) => void): () => void;
  onExit(callback: (projectId: string, exitCode: number, signal?: number) => void): () => void;
  onStatus(callback: (projectId: string, state: CliSurfaceRuntimeState) => void): () => void;
  onError(callback: (projectId: string, message: string) => void): () => void;
}

export function createPreloadCliSurfaceApi(
  ipcRenderer: IpcRenderer,
  onChannel: OnChannel,
): PreloadCliSurfaceApi {
  return {
    discover: (projectPath: string) =>
      ipcRenderer.invoke('cli-surface:discover', projectPath),
    start: (projectId: string, profile: CliSurfaceProfile) =>
      ipcRenderer.invoke('cli-surface:start', projectId, profile),
    stop: (projectId: string) =>
      ipcRenderer.invoke('cli-surface:stop', projectId),
    restart: (projectId: string) =>
      ipcRenderer.invoke('cli-surface:restart', projectId),
    write: (projectId: string, data: string) =>
      ipcRenderer.send('cli-surface:write', projectId, data),
    resize: (projectId: string, cols: number, rows: number) =>
      ipcRenderer.send('cli-surface:resize', projectId, cols, rows),
    onData: (callback) =>
      onChannel('cli-surface:data', (projectId, data) =>
        callback(projectId as string, data as string)),
    onExit: (callback) =>
      onChannel('cli-surface:exit', (projectId, exitCode, signal) =>
        callback(projectId as string, exitCode as number, signal as number | undefined)),
    onStatus: (callback) =>
      onChannel('cli-surface:status', (projectId, state) =>
        callback(projectId as string, state as CliSurfaceRuntimeState)),
    onError: (callback) =>
      onChannel('cli-surface:error', (projectId, message) =>
        callback(projectId as string, message as string)),
  };
}
