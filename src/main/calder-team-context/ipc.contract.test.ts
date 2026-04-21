import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const calderIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-calder.ts'), 'utf8');
const preloadSource = [
  readFileSync(path.join(process.cwd(), 'src/preload/preload.ts'), 'utf8'),
  readFileSync(path.join(process.cwd(), 'src/preload/preload-api-project-domains.ts'), 'utf8'),
].join('\n');
const rendererTypesSource = readFileSync(path.join(process.cwd(), 'src/renderer/types.ts'), 'utf8');

describe('project team context IPC contract', () => {
  it('delegates team context ipc handlers to calder module', () => {
    expect(ipcSource).toContain('registerCalderIpcHandlers({');
    expect(calderIpcSource).toContain("ipcMain.handle('teamContext:getProjectState'");
    expect(calderIpcSource).toContain("ipcMain.handle('teamContext:createStarterFiles'");
    expect(calderIpcSource).toContain("ipcMain.handle('teamContext:createSpace'");
    expect(calderIpcSource).toContain("ipcMain.on('teamContext:watchProject'");
    expect(calderIpcSource).toContain("bindProjectWatcher(projectTeamContextBindings");
    expect(calderIpcSource).toContain("startProjectTeamContextWatcher");
    expect(calderIpcSource).toContain("'teamContext:changed'");
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
