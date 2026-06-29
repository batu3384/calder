import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const calderIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-calder.ts'), 'utf8');
const preloadSource = [
  readFileSync(path.join(process.cwd(), 'src/preload/preload.ts'), 'utf8'),
  readFileSync(path.join(process.cwd(), 'src/preload/preload-api-project-domains.ts'), 'utf8'),
].join('\n');
const rendererTypesSource = readFileSync(path.join(process.cwd(), 'src/renderer/types.ts'), 'utf8');

describe('project review IPC contract', () => {
  it('delegates project review ipc handlers to calder module', () => {
    expect(ipcSource).toContain('registerCalderIpcHandlers({');
    expect(calderIpcSource).toContain("ipcMain.handle('review:getProjectState'");
    expect(calderIpcSource).toContain("ipcMain.handle('review:createFile'");
    expect(calderIpcSource).toContain("ipcMain.handle('review:readFile'");
    expect(calderIpcSource).toContain("ipcMain.on('review:watchProject'");
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
