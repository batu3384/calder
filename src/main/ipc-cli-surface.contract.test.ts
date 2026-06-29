import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('cli-surface IPC delegation contract', () => {
  const ipcHandlersSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers.ts'),
    'utf8',
  );
  const cliSurfaceSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-cli-surface.ts'),
    'utf8',
  );

  it('delegates cli-surface channel registration from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain('registerCliSurfaceIpcHandlers(cliSurfaceRuntime, {');
    expect(ipcHandlersSource).toContain('resolveProjectPath:');
    expect(ipcHandlersSource).toContain('isWithinKnownProject,');
    expect(cliSurfaceSource).toContain("ipcMain.handle('cli-surface:start'");
    expect(cliSurfaceSource).toContain("ipcMain.handle('cli-surface:discover'");
    expect(cliSurfaceSource).toContain("ipcMain.handle('cli-surface:stop'");
    expect(cliSurfaceSource).toContain("ipcMain.handle('cli-surface:restart'");
    expect(cliSurfaceSource).toContain("ipcMain.on('cli-surface:write'");
    expect(cliSurfaceSource).toContain("ipcMain.on('cli-surface:resize'");
  });
});
