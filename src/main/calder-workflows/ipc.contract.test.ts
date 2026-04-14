import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const preloadSource = readFileSync(path.join(process.cwd(), 'src/preload/preload.ts'), 'utf8');
const rendererTypesSource = readFileSync(path.join(process.cwd(), 'src/renderer/types.ts'), 'utf8');

describe('project workflow IPC contract', () => {
  it('registers workflow ipc handlers in main', () => {
    expect(ipcSource).toContain("ipcMain.handle('workflow:getProjectState'");
    expect(ipcSource).toContain("ipcMain.handle('workflow:createStarterFiles'");
    expect(ipcSource).toContain("ipcMain.handle('workflow:createFile'");
    expect(ipcSource).toContain("ipcMain.handle('workflow:readFile'");
    expect(ipcSource).toContain("ipcMain.on('workflow:watchProject'");
  });

  it('exposes workflow APIs in preload', () => {
    expect(preloadSource).toContain('workflow: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('workflow:getProjectState'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workflow:createStarterFiles'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workflow:createFile'");
    expect(preloadSource).toContain("ipcRenderer.invoke('workflow:readFile'");
    expect(preloadSource).toContain("ipcRenderer.send('workflow:watchProject'");
  });

  it('declares workflow APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('workflow: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string): Promise<ProjectWorkflowState>;');
    expect(rendererTypesSource).toContain('createStarterFiles(projectPath: string): Promise<ProjectWorkflowStarterFilesResult>;');
    expect(rendererTypesSource).toContain('createFile(projectPath: string, title: string): Promise<ProjectWorkflowCreateResult>;');
    expect(rendererTypesSource).toContain('readFile(projectPath: string, workflowPath: string): Promise<ProjectWorkflowDocument>;');
  });
});
