import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn(() => '/home/test'));
const mockCheckForUpdates = vi.hoisted(() => vi.fn());
const mockQuitAndInstall = vi.hoisted(() => vi.fn());
const mockGetProvider = vi.hoisted(() => vi.fn());
const mockIsTrackingHealthy = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock('os', () => ({
  homedir: mockHomedir,
}));

vi.mock('./auto-updater', () => ({
  checkForUpdates: mockCheckForUpdates,
  quitAndInstall: mockQuitAndInstall,
}));

vi.mock('./providers/registry', () => ({
  getProvider: mockGetProvider,
}));

vi.mock('../shared/tracking-health', () => ({
  isTrackingHealthy: mockIsTrackingHealthy,
}));

import { registerMaintenanceIpcHandlers } from './ipc-maintenance';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

describe('ipc maintenance handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads cached stats and returns null when the cache file cannot be read', () => {
    registerMaintenanceIpcHandlers();
    const getCache = getHandleHandler('stats:getCache');

    mockReadFileSync.mockReturnValueOnce('{"tokens":123}');
    expect(getCache({})).toEqual({ tokens: 123 });
    expect(mockReadFileSync).toHaveBeenCalledWith('/home/test/.claude/stats-cache.json', 'utf-8');

    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('missing');
    });
    expect(getCache({})).toBeNull();
  });

  it('delegates update check/install commands', () => {
    registerMaintenanceIpcHandlers();
    const checkNow = getHandleHandler('update:checkNow');
    const install = getHandleHandler('update:install');

    checkNow({});
    install({});

    expect(mockCheckForUpdates).toHaveBeenCalled();
    expect(mockQuitAndInstall).toHaveBeenCalled();
  });

  it('reinstalls and validates settings with provider defaults and error fallback', () => {
    const provider = {
      reinstallSettings: vi.fn(),
      validateSettings: vi.fn(() => ({ hooks: 'complete' })),
      meta: { id: 'claude' },
    };
    mockGetProvider.mockReturnValue(provider);
    mockIsTrackingHealthy.mockReturnValue(true);
    registerMaintenanceIpcHandlers();

    const reinstall = getHandleHandler('settings:reinstall');
    const validate = getHandleHandler('settings:validate');

    const reinstallResult = reinstall({});
    const validateResult = validate({});

    expect(mockGetProvider).toHaveBeenCalledWith('claude');
    expect(provider.reinstallSettings).toHaveBeenCalled();
    expect(provider.validateSettings).toHaveBeenCalledTimes(2);
    expect(mockIsTrackingHealthy).toHaveBeenCalledWith(provider.meta, { hooks: 'complete' });
    expect(reinstallResult).toEqual({ success: true });
    expect(validateResult).toEqual({ hooks: 'complete' });
  });

  it('returns reinstall failure when provider reinstall throws', () => {
    const provider = {
      reinstallSettings: vi.fn(() => {
        throw new Error('boom');
      }),
      validateSettings: vi.fn(() => ({ hooks: 'complete' })),
      meta: { id: 'claude' },
    };
    mockGetProvider.mockReturnValue(provider);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerMaintenanceIpcHandlers();

    const reinstall = getHandleHandler('settings:reinstall');
    const result = reinstall({}, 'codex');

    expect(mockGetProvider).toHaveBeenCalledWith('codex');
    expect(result).toEqual({ success: false });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

