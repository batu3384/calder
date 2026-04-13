import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ipcHandlersSource = readFileSync(
  new URL('../ipc-handlers.ts', import.meta.url),
  'utf8',
);
const preloadSource = readFileSync(
  new URL('../../preload/preload.ts', import.meta.url),
  'utf8',
);
const rendererTypesSource = readFileSync(
  new URL('../../renderer/types.ts', import.meta.url),
  'utf8',
);

describe('project context IPC contract', () => {
  it('registers context IPC handlers in main', () => {
    expect(ipcHandlersSource).toContain("ipcMain.handle('context:getProjectState'");
    expect(ipcHandlersSource).toContain("ipcMain.on('context:watchProject'");
    expect(ipcHandlersSource).toContain("webContents.send('context:changed'");
  });

  it('exposes context APIs from preload', () => {
    expect(preloadSource).toContain('context: {');
    expect(preloadSource).toContain('getProjectState');
    expect(preloadSource).toContain('watchProject');
    expect(preloadSource).toContain("onChanged: (callback) => onChannel('context:changed'");
  });

  it('declares context APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('context: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string)');
    expect(rendererTypesSource).toContain('watchProject(projectPath: string)');
  });
});
