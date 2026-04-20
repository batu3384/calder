import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const ipcHandlersSource = readFileSync(new URL('./ipc-handlers.ts', import.meta.url), 'utf8');
const cliSurfaceIpcSource = readFileSync(new URL('./ipc-cli-surface.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/preload.ts', import.meta.url), 'utf8');

describe('cli surface discovery IPC contract', () => {
  it('registers a discover handler in the main process', () => {
    expect(ipcHandlersSource).toContain('registerCliSurfaceIpcHandlers(cliSurfaceRuntime);');
    expect(cliSurfaceIpcSource).toContain("ipcMain.handle('cli-surface:discover'");
    expect(cliSurfaceIpcSource).toContain('discoverCliSurface(');
  });

  it('exposes discover on window.calder.cliSurface', () => {
    expect(preloadSource).toContain("discover: (projectPath: string)");
    expect(preloadSource).toContain("ipcRenderer.invoke('cli-surface:discover', projectPath)");
  });
});
