import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('browser tab preload path cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('caches successful preload-path lookups', async () => {
    const getBrowserPreloadPath = vi.fn(async () => '/tmp/browser-tab-preload.js');
    (globalThis as any).window = {
      calder: {
        app: {
          getBrowserPreloadPath,
        },
      },
    };

    const { getPreloadPath } = await import('./instance.js');
    await expect(getPreloadPath()).resolves.toBe('/tmp/browser-tab-preload.js');
    await expect(getPreloadPath()).resolves.toBe('/tmp/browser-tab-preload.js');
    expect(getBrowserPreloadPath).toHaveBeenCalledTimes(1);
  });

  it('retries preload-path lookup after a transient failure', async () => {
    const getBrowserPreloadPath = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ipc not ready'))
      .mockResolvedValue('/tmp/browser-tab-preload.js');
    (globalThis as any).window = {
      calder: {
        app: {
          getBrowserPreloadPath,
        },
      },
    };

    const { getPreloadPath } = await import('./instance.js');
    await expect(getPreloadPath()).rejects.toThrow('ipc not ready');
    await expect(getPreloadPath()).resolves.toBe('/tmp/browser-tab-preload.js');
    expect(getBrowserPreloadPath).toHaveBeenCalledTimes(2);
  });
});
