import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockFromWebContents = vi.hoisted(() => vi.fn());
const mockExecSync = vi.hoisted(() => vi.fn());
const mockStatSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockExpandUserPath = vi.hoisted(() =>
  vi.fn((value: string) => value.replace(/^~(?=\/|$)/, '/home/test')),
);
const mockWatchFileForChanges = vi.hoisted(() => vi.fn());
const mockUnwatchFileForChanges = vi.hoisted(() => vi.fn());
const mockSetFileWatcherWindow = vi.hoisted(() => vi.fn());
const mockLoadState = vi.hoisted(() => vi.fn());
const mockSaveState = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    fromWebContents: mockFromWebContents,
  },
}));

vi.mock('child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('fs', () => ({
  statSync: mockStatSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('./fs-utils', () => ({
  expandUserPath: mockExpandUserPath,
}));

vi.mock('./file-watcher', () => ({
  watchFile: mockWatchFileForChanges,
  unwatchFile: mockUnwatchFileForChanges,
  setFileWatcherWindow: mockSetFileWatcherWindow,
}));

vi.mock('./store', () => ({
  loadState: mockLoadState,
  saveState: mockSaveState,
}));

import { registerFsStoreIpcHandlers } from './ipc-fs-store';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function getOnHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.on registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function createPolicy(
  overrides?: Partial<Parameters<typeof registerFsStoreIpcHandlers>[0]>,
): Parameters<typeof registerFsStoreIpcHandlers>[0] {
  return {
    isAllowedDirectoryLookupPath: vi.fn(() => true),
    isAllowedReadPath: vi.fn(() => true),
    isWithinKnownProject: vi.fn(() => true),
    sanitizePersistedStateForSave: vi.fn((state) => state as any),
    ...overrides,
  };
}

function dirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
  };
}

describe('ipc fs/store runtime branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('covers fs:isDirectory success and catch branches', () => {
    const policy = createPolicy();
    registerFsStoreIpcHandlers(policy);
    const isDirectory = getHandleHandler('fs:isDirectory');

    mockStatSync.mockReturnValue({ isDirectory: () => true });
    expect(isDirectory({}, '/repo')).toBe(true);

    mockStatSync.mockImplementationOnce(() => {
      throw new Error('stat failed');
    });
    expect(isDirectory({}, '/repo/missing')).toBe(false);
  });

  it('covers listDirs blocked, sorted, and catch branches', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const blockedPolicy = createPolicy({ isAllowedDirectoryLookupPath: vi.fn(() => false) });
    registerFsStoreIpcHandlers(blockedPolicy);
    const blockedListDirs = getHandleHandler('fs:listDirs');
    expect(blockedListDirs({}, '/outside')).toEqual([]);

    mockIpcHandle.mockClear();
    const allowPolicy = createPolicy();
    registerFsStoreIpcHandlers(allowPolicy);
    const listDirs = getHandleHandler('fs:listDirs');

    mockReaddirSync.mockReturnValueOnce([
      dirent('zeta', true),
      dirent('alpha', true),
      dirent('beta.txt', false),
    ]);
    expect(listDirs({}, '/repo')).toEqual([
      path.join(path.resolve('/repo'), 'alpha'),
      path.join(path.resolve('/repo'), 'zeta'),
    ]);

    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    expect(listDirs({}, '/repo')).toEqual([]);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('covers listFiles fallback walk, ignore rules, and nested walk read failures', () => {
    const policy = createPolicy({ isWithinKnownProject: vi.fn(() => true) });
    registerFsStoreIpcHandlers(policy);
    const listFiles = getHandleHandler('fs:listFiles');

    const repoRoot = path.resolve('/repo');
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    mockReaddirSync.mockImplementation((dir: string) => {
      if (dir === repoRoot) {
        return [
          dirent('src', true),
          dirent('README.md', false),
          dirent('.hidden', false),
          dirent('node_modules', true),
        ];
      }
      if (dir === path.join(repoRoot, 'src')) {
        return [dirent('app.ts', false), dirent('nested', true)];
      }
      if (dir === path.join(repoRoot, 'src', 'nested')) {
        throw new Error('nested read denied');
      }
      return [];
    });

    expect(listFiles({}, '/repo', '')).toEqual(['src/app.ts', 'README.md']);
    expect(listFiles({}, '/repo', 'app')).toEqual(['src/app.ts']);
  });

  it('covers listFiles outside-project guard and outer catch branch', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const blockedPolicy = createPolicy({ isWithinKnownProject: vi.fn(() => false) });
    registerFsStoreIpcHandlers(blockedPolicy);
    const listFilesBlocked = getHandleHandler('fs:listFiles');
    expect(listFilesBlocked({}, '/outside', '')).toEqual([]);

    mockIpcHandle.mockClear();
    const throwingPolicy = createPolicy({
      isWithinKnownProject: vi.fn(() => {
        throw new Error('policy failed');
      }),
    });
    registerFsStoreIpcHandlers(throwingPolicy);
    const listFilesWithThrow = getHandleHandler('fs:listFiles');
    expect(listFilesWithThrow({}, '/repo', '')).toEqual([]);

    expect(warnSpy).toHaveBeenCalledWith('fs:listFiles failed:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('covers readFile catch branch and watchFile denied branch', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const readPolicy = createPolicy({ isAllowedReadPath: vi.fn(() => true) });
    registerFsStoreIpcHandlers(readPolicy);
    const readFile = getHandleHandler('fs:readFile');

    mockReadFileSync.mockImplementation(() => {
      throw new Error('read failed');
    });
    expect(readFile({}, '/repo/file.txt')).toEqual({
      ok: false,
      reason: 'read-error',
      message: 'read failed',
    });

    mockIpcOn.mockClear();
    const watchPolicy = createPolicy({ isAllowedReadPath: vi.fn(() => false) });
    registerFsStoreIpcHandlers(watchPolicy);
    const watchFile = getOnHandler('fs:watchFile');
    const unwatchFile = getOnHandler('fs:unwatchFile');

    watchFile({ sender: {} }, './denied.md');
    unwatchFile({}, './denied.md');

    expect(mockFromWebContents).not.toHaveBeenCalled();
    expect(mockSetFileWatcherWindow).not.toHaveBeenCalled();
    expect(mockWatchFileForChanges).not.toHaveBeenCalled();
    expect(mockUnwatchFileForChanges).toHaveBeenCalledWith(path.resolve('./denied.md'));

    expect(warnSpy).toHaveBeenCalledWith('fs:readFile failed:', expect.any(Error));
    warnSpy.mockRestore();
  });
});
