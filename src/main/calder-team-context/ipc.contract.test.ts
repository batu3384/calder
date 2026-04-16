import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const preloadSource = readFileSync(path.join(process.cwd(), 'src/preload/preload.ts'), 'utf8');
const rendererTypesSource = readFileSync(path.join(process.cwd(), 'src/renderer/types.ts'), 'utf8');

describe('project team context IPC contract', () => {
  it('registers team context ipc handlers in main', () => {
    expect(ipcSource).toContain("ipcMain.handle('teamContext:getProjectState'");
    expect(ipcSource).toContain("ipcMain.handle('teamContext:createStarterFiles'");
    expect(ipcSource).toContain("ipcMain.handle('teamContext:createSpace'");
    expect(ipcSource).toContain("ipcMain.on('teamContext:watchProject'");
    expect(ipcSource).toContain('currentProjectTeamContextDispose?.();');
    expect(ipcSource).toContain('currentProjectTeamContextDispose = startProjectTeamContextWatcher(');
  });

  it('exposes team context APIs in preload', () => {
    expect(preloadSource).toContain('teamContext: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('teamContext:getProjectState'");
    expect(preloadSource).toContain("ipcRenderer.invoke('teamContext:createStarterFiles'");
    expect(preloadSource).toContain("ipcRenderer.invoke('teamContext:createSpace'");
    expect(preloadSource).toContain("ipcRenderer.send('teamContext:watchProject'");
  });

  it('declares team context APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('teamContext: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string): Promise<ProjectTeamContextState>;');
    expect(rendererTypesSource).toContain('createStarterFiles(projectPath: string): Promise<ProjectTeamContextStarterFilesResult>;');
    expect(rendererTypesSource).toContain('createSpace(projectPath: string, title: string): Promise<ProjectTeamContextCreateSpaceResult>;');
  });
});
