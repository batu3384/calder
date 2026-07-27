import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn(() => '/home/test'));
const mockCheckForUpdates = vi.hoisted(() => vi.fn());
const mockQuitAndInstall = vi.hoisted(() => vi.fn());

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
});
