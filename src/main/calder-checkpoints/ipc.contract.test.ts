import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const preloadSource = readFileSync(path.join(process.cwd(), 'src/preload/preload.ts'), 'utf8');
const rendererTypesSource = readFileSync(path.join(process.cwd(), 'src/renderer/types.ts'), 'utf8');

describe('project checkpoint IPC contract', () => {
  it('registers checkpoint ipc handlers in main', () => {
    expect(ipcSource).toContain("ipcMain.handle('checkpoint:getProjectState'");
    expect(ipcSource).toContain("ipcMain.handle('checkpoint:create'");
    expect(ipcSource).toContain("ipcMain.handle('checkpoint:read'");
    expect(ipcSource).toContain("ipcMain.on('checkpoint:watchProject'");
  });

  it('exposes checkpoint APIs in preload', () => {
    expect(preloadSource).toContain('checkpoint: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('checkpoint:getProjectState'");
    expect(preloadSource).toContain("ipcRenderer.invoke('checkpoint:create'");
    expect(preloadSource).toContain("ipcRenderer.invoke('checkpoint:read'");
    expect(preloadSource).toContain("ipcRenderer.send('checkpoint:watchProject'");
  });

  it('declares checkpoint APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('checkpoint: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string): Promise<ProjectCheckpointState>;');
    expect(rendererTypesSource).toContain('create(projectPath: string, snapshot: ProjectCheckpointSnapshotInput): Promise<ProjectCheckpointCreateResult>;');
    expect(rendererTypesSource).toContain('read(projectPath: string, checkpointPath: string): Promise<ProjectCheckpointDocument>;');
  });
});
