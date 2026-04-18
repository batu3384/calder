import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const ipcHandlersSource = readFileSync(new URL('./ipc-handlers.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/preload.ts', import.meta.url), 'utf8');
const rendererTypesSource = readFileSync(new URL('../renderer/types.ts', import.meta.url), 'utf8');

describe('mobile inspect IPC contract', () => {
  it('registers launch and screenshot handlers in main process', () => {
    expect(ipcHandlersSource).toContain("ipcMain.handle('mobileInspect:launch'");
    expect(ipcHandlersSource).toContain("ipcMain.handle('mobileInspect:captureScreenshot'");
    expect(ipcHandlersSource).toContain("ipcMain.handle('mobileInspect:inspectPoint'");
    expect(ipcHandlersSource).toContain("ipcMain.handle('mobileInspect:interact'");
    expect(ipcHandlersSource).toContain('launchMobileInspectSurface(');
    expect(ipcHandlersSource).toContain('captureMobileInspectScreenshot(');
    expect(ipcHandlersSource).toContain('inspectMobilePoint(');
    expect(ipcHandlersSource).toContain('interactMobileInspectPoint(');
  });

  it('exposes mobile inspect APIs on preload bridge', () => {
    expect(preloadSource).toContain('mobileInspect: {');
    expect(preloadSource).toContain('launch(platform: MobileInspectPlatform)');
    expect(preloadSource).toContain('captureScreenshot(platform: MobileInspectPlatform)');
    expect(preloadSource).toContain('inspectPoint(platform: MobileInspectPlatform, x: number, y: number)');
    expect(preloadSource).toContain('interact(platform: MobileInspectPlatform, x: number, y: number)');
    expect(preloadSource).toContain("ipcRenderer.invoke('mobileInspect:launch', platform)");
    expect(preloadSource).toContain("ipcRenderer.invoke('mobileInspect:captureScreenshot', platform)");
    expect(preloadSource).toContain("ipcRenderer.invoke('mobileInspect:inspectPoint', platform, x, y)");
    expect(preloadSource).toContain("ipcRenderer.invoke('mobileInspect:interact', platform, x, y)");
  });

  it('keeps renderer-side CalderApi typing aligned with preload bridge', () => {
    expect(rendererTypesSource).toContain('mobileInspect: {');
    expect(rendererTypesSource).toContain('launch(platform: MobileInspectPlatform)');
    expect(rendererTypesSource).toContain('captureScreenshot(platform: MobileInspectPlatform)');
    expect(rendererTypesSource).toContain('inspectPoint(platform: MobileInspectPlatform, x: number, y: number)');
    expect(rendererTypesSource).toContain('interact(platform: MobileInspectPlatform, x: number, y: number)');
  });
});
