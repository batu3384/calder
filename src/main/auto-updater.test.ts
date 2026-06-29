import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn().mockResolvedValue({}),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  },
}));

const mockSend = vi.fn();

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mockSend } }],
  },
}));

import { autoUpdater } from 'electron-updater';

import { checkForUpdates, initAutoUpdater, quitAndInstall } from './auto-updater';

describe('auto-updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('registers event listeners and configures autoUpdater', () => {
    initAutoUpdater();
    expect(autoUpdater.autoDownload).toBe(true);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(autoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
    expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
    expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
    expect(autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('schedules check after 10s delay', () => {
    initAutoUpdater();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('checkForUpdates delegates to autoUpdater', () => {
    checkForUpdates();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it('quitAndInstall delegates to autoUpdater', () => {
    quitAndInstall();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it('forwards update-available event to renderer', () => {
    initAutoUpdater();
    const handler = vi
      .mocked(autoUpdater.on)
      .mock.calls.find((c) => c[0] === 'update-available')![1] as (info: {
      version: string;
    }) => void;
    handler({ version: '1.2.3' });
    expect(mockSend).toHaveBeenCalledWith('update:available', { version: '1.2.3' });
  });

  it('forwards download-progress event to renderer', () => {
    initAutoUpdater();
    const handler = vi
      .mocked(autoUpdater.on)
      .mock.calls.find((c) => c[0] === 'download-progress')![1] as (progress: {
      percent: number;
    }) => void;
    handler({ percent: 55.7 });
    expect(mockSend).toHaveBeenCalledWith('update:download-progress', { percent: 56 });
  });

  it('forwards update-downloaded event to renderer', () => {
    initAutoUpdater();
    const handler = vi
      .mocked(autoUpdater.on)
      .mock.calls.find((c) => c[0] === 'update-downloaded')![1] as (info: {
      version: string;
    }) => void;
    handler({ version: '2.0.0' });
    expect(mockSend).toHaveBeenCalledWith('update:downloaded', { version: '2.0.0' });
  });

  it('forwards error event to renderer', () => {
    initAutoUpdater();
    const handler = vi.mocked(autoUpdater.on).mock.calls.find((c) => c[0] === 'error')![1] as (
      err: Error,
    ) => void;
    handler(new Error('update failed'));
    expect(mockSend).toHaveBeenCalledWith('update:error', { message: 'update failed' });
  });

  it('falls back to an Unknown error message when updater error lacks message', () => {
    initAutoUpdater();
    const handler = vi.mocked(autoUpdater.on).mock.calls.find((c) => c[0] === 'error')![1] as (
      err?: Error,
    ) => void;
    handler(undefined);
    expect(mockSend).toHaveBeenCalledWith('update:error', { message: 'Unknown error' });
  });

  it('swallows checkForUpdates rejections', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(new Error('network unavailable'));
    expect(() => checkForUpdates()).not.toThrow();
    await Promise.resolve();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  it('does not send renderer events when no window exists', async () => {
    vi.resetModules();
    const isolatedSend = vi.fn();
    vi.doMock('electron', () => ({
      app: { isPackaged: true },
      BrowserWindow: { getAllWindows: () => [] },
    }));
    vi.doMock('electron-updater', () => ({
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        checkForUpdates: vi.fn().mockResolvedValue({}),
        quitAndInstall: vi.fn(),
        on: vi.fn(),
      },
    }));

    const mod = await import('./auto-updater');
    const { autoUpdater: freshUpdater } = await import('electron-updater');
    mod.initAutoUpdater();
    const handler = vi
      .mocked(freshUpdater.on)
      .mock.calls.find((c) => c[0] === 'update-available')![1] as (info: {
      version: string;
    }) => void;
    handler({ version: '9.9.9' });

    expect(isolatedSend).not.toHaveBeenCalled();
  });

  it('skips initialization in dev mode', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { isPackaged: false },
      BrowserWindow: { getAllWindows: () => [] },
    }));
    vi.doMock('electron-updater', () => ({
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        checkForUpdates: vi.fn(),
        quitAndInstall: vi.fn(),
        on: vi.fn(),
      },
    }));
    const mod = await import('./auto-updater');
    const { autoUpdater: freshUpdater } = await import('electron-updater');
    mod.initAutoUpdater();
    expect(freshUpdater.on).not.toHaveBeenCalled();
  });
});
