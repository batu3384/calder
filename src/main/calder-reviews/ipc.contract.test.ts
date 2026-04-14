import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const preloadSource = readFileSync(path.join(process.cwd(), 'src/preload/preload.ts'), 'utf8');
const rendererTypesSource = readFileSync(path.join(process.cwd(), 'src/renderer/types.ts'), 'utf8');

describe('project review IPC contract', () => {
  it('registers project review ipc handlers in main', () => {
    expect(ipcSource).toContain("ipcMain.handle('review:getProjectState'");
    expect(ipcSource).toContain("ipcMain.handle('review:createFile'");
    expect(ipcSource).toContain("ipcMain.handle('review:readFile'");
    expect(ipcSource).toContain("ipcMain.on('review:watchProject'");
  });

  it('exposes project review APIs in preload', () => {
    expect(preloadSource).toContain('review: {');
    expect(preloadSource).toContain("ipcRenderer.invoke('review:getProjectState'");
    expect(preloadSource).toContain("ipcRenderer.invoke('review:createFile'");
    expect(preloadSource).toContain("ipcRenderer.invoke('review:readFile'");
    expect(preloadSource).toContain("ipcRenderer.send('review:watchProject'");
  });

  it('declares project review APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('review: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string): Promise<ProjectReviewState>;');
    expect(rendererTypesSource).toContain('createFile(projectPath: string, title: string): Promise<ProjectReviewCreateResult>;');
    expect(rendererTypesSource).toContain('readFile(projectPath: string, reviewPath: string): Promise<ProjectReviewDocument>;');
  });
});
