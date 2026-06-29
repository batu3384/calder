import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ipcHandlersSource = readFileSync(
  new URL('../ipc-handlers.ts', import.meta.url),
  'utf8',
);
const calderIpcSource = readFileSync(
  new URL('../ipc-calder.ts', import.meta.url),
  'utf8',
);
const preloadSource = [
  readFileSync(new URL('../../preload/preload.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../preload/preload-api-project-domains.ts', import.meta.url), 'utf8'),
].join('\n');
const rendererTypesSource = readFileSync(
  new URL('../../renderer/types.ts', import.meta.url),
  'utf8',
);

describe('project context IPC contract', () => {
  it('delegates context IPC handlers from main registration module', () => {
    expect(ipcHandlersSource).toContain('registerCalderIpcHandlers({');
    expect(calderIpcSource).toContain("ipcMain.handle('context:getProjectState'");
    expect(calderIpcSource).toContain("ipcMain.handle('context:createStarterFiles'");
    expect(calderIpcSource).toContain("ipcMain.handle('context:createSharedRule'");
    expect(calderIpcSource).toContain("ipcMain.handle('context:renameSharedRule'");
    expect(calderIpcSource).toContain("ipcMain.handle('context:deleteSharedRule'");
    expect(calderIpcSource).toContain("ipcMain.on('context:watchProject'");
    expect(calderIpcSource).toContain("bindProjectWatcher(projectContextBindings");
    expect(calderIpcSource).toContain("'context:changed'");
  });

  it('exposes context APIs from preload', () => {
    expect(preloadSource).toContain('context: {');
    expect(preloadSource).toContain('getProjectState');
    expect(preloadSource).toContain('createStarterFiles');
    expect(preloadSource).toContain('createSharedRule');
    expect(preloadSource).toContain('renameSharedRule');
    expect(preloadSource).toContain('deleteSharedRule');
    expect(preloadSource).toContain('watchProject');
    expect(preloadSource).toContain("onChanged: (callback) => onChannel('context:changed'");
  });

  it('declares context APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('context: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string)');
    expect(rendererTypesSource).toContain('createStarterFiles(projectPath: string)');
    expect(rendererTypesSource).toContain("createSharedRule(projectPath: string, title: string, priority: 'hard' | 'soft')");
    expect(rendererTypesSource).toContain("renameSharedRule(projectPath: string, relativePath: string, title: string, priority: 'hard' | 'soft')");
    expect(rendererTypesSource).toContain('deleteSharedRule(projectPath: string, relativePath: string)');
    expect(rendererTypesSource).toContain('watchProject(projectPath: string)');
  });
});
