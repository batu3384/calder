import { ipcMain } from 'electron';
import type { CliSurfaceProfile } from '../shared/types';
import { discoverCliSurface } from './cli-surface-discovery';

export interface CliSurfaceRuntime {
  start: (projectId: string, profile: CliSurfaceProfile) => Promise<void>;
  stop: (projectId: string) => void;
  restart: (projectId: string) => Promise<void>;
  write: (projectId: string, data: string) => void;
  resize: (projectId: string, cols: number, rows: number) => void;
}

export function registerCliSurfaceIpcHandlers(runtime: CliSurfaceRuntime): void {
  ipcMain.handle('cli-surface:start', async (_event, projectId: string, profile) => {
    await runtime.start(projectId, profile);
  });

  ipcMain.handle('cli-surface:discover', (_event, projectPath: string) => {
    return discoverCliSurface(projectPath);
  });

  ipcMain.handle('cli-surface:stop', (_event, projectId: string) => {
    runtime.stop(projectId);
  });

  ipcMain.handle('cli-surface:restart', async (_event, projectId: string) => {
    await runtime.restart(projectId);
  });

  ipcMain.on('cli-surface:write', (_event, projectId: string, data: string) => {
    runtime.write(projectId, data);
  });

  ipcMain.on('cli-surface:resize', (_event, projectId: string, cols: number, rows: number) => {
    runtime.resize(projectId, cols, rows);
  });
}
