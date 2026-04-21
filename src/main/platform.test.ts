import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

async function importPlatformModuleFor(platform: NodeJS.Platform) {
  vi.resetModules();
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
  return import('./platform');
}

afterEach(() => {
  vi.resetModules();
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
});

describe('platform constants', () => {
  it('uses Windows-specific constants on win32', async () => {
    const platform = await importPlatformModuleFor('win32');
    expect(platform.isWin).toBe(true);
    expect(platform.isMac).toBe(false);
    expect(platform.pathSep).toBe(';');
    expect(platform.whichCmd).toBe('where');
    expect(platform.pythonBin).toBe('python');
  });

  it('uses POSIX constants on darwin', async () => {
    const platform = await importPlatformModuleFor('darwin');
    expect(platform.isWin).toBe(false);
    expect(platform.isMac).toBe(true);
    expect(platform.pathSep).toBe(':');
    expect(platform.whichCmd).toBe('which');
    expect(platform.pythonBin).toBe('/usr/bin/python3');
  });
});
