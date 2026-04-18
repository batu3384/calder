import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const ipcHandlersSource = readFileSync(new URL('./ipc-handlers.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/preload.ts', import.meta.url), 'utf8');
const rendererTypesSource = readFileSync(new URL('../renderer/types.ts', import.meta.url), 'utf8');

describe('mobile setup IPC contract', () => {
  it('registers dependency check and install handlers in the main process', () => {
    expect(ipcHandlersSource).toContain("ipcMain.handle('mobileSetup:checkDependencies'");
    expect(ipcHandlersSource).toContain("ipcMain.handle('mobileSetup:installDependency'");
    expect(ipcHandlersSource).toContain('checkMobileDependencies()');
    expect(ipcHandlersSource).toContain('installMobileDependency(');
    expect(ipcHandlersSource).toContain("event.sender.send('mobileSetup:installProgress'");
  });

  it('exposes mobile setup APIs on preload bridge', () => {
    expect(preloadSource).toContain('mobileSetup: {');
    expect(preloadSource).toContain('checkDependencies(): Promise<MobileDependencyReport>');
    expect(preloadSource).toContain('installDependency(dependencyId: MobileDependencyId, installId?: string)');
    expect(preloadSource).toContain('onInstallProgress(callback: (event: MobileDependencyInstallProgressEvent) => void)');
    expect(preloadSource).toContain("ipcRenderer.invoke('mobileSetup:checkDependencies')");
    expect(preloadSource).toContain("ipcRenderer.invoke('mobileSetup:installDependency', dependencyId, installId)");
    expect(preloadSource).toContain("onChannel('mobileSetup:installProgress'");
  });

  it('keeps renderer-side CalderApi typing aligned with preload bridge', () => {
    expect(rendererTypesSource).toContain('mobileSetup: {');
    expect(rendererTypesSource).toContain('checkDependencies(): Promise<MobileDependencyReport>');
    expect(rendererTypesSource).toContain('installDependency(dependencyId: MobileDependencyId, installId?: string)');
    expect(rendererTypesSource).toContain('onInstallProgress(callback: (event: MobileDependencyInstallProgressEvent) => void)');
  });
});
