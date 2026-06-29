import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockFromWebContents = vi.hoisted(() => vi.fn());
const mockExecSync = vi.hoisted(() => vi.fn());
const mockStatSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockExpandUserPath = vi.hoisted(() => vi.fn((value: string) => value.replace(/^~(?=\/|$)/, '/home/test')));
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

import { FS_READ_FILE_MAX_BYTES, registerFsStoreIpcHandlers } from './ipc-fs-store';

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

function createPolicy(overrides?: Partial<Parameters<typeof registerFsStoreIpcHandlers>[0]>): Parameters<typeof registerFsStoreIpcHandlers>[0] {
  return {
    isAllowedDirectoryLookupPath: vi.fn(() => true),
    isAllowedReadPath: vi.fn(() => true),
    isWithinKnownProject: vi.fn(() => true),
    sanitizePersistedStateForSave: vi.fn((state) => state as any),
    ...overrides,
  };
}

describe('ipc fs/store handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks fs:isDirectory lookups outside allowed lookup paths', () => {
    const policy = createPolicy({ isAllowedDirectoryLookupPath: vi.fn(() => false) });
    registerFsStoreIpcHandlers(policy);

    const isDirectory = getHandleHandler('fs:isDirectory');
    const result = isDirectory({}, '/outside');

    expect(result).toBe(false);
    expect(mockStatSync).not.toHaveBeenCalled();
  });

  it('limits listDirs enumeration outside known projects when no prefix is provided', () => {
    const policy = createPolicy({
      isAllowedDirectoryLookupPath: vi.fn(() => true),
      isWithinKnownProject: vi.fn(() => false),
    });
    registerFsStoreIpcHandlers(policy);

    const listDirs = getHandleHandler('fs:listDirs');
    const result = listDirs({}, '/outside');

    expect(result).toEqual([]);
    expect(mockReaddirSync).not.toHaveBeenCalled();
  });

  it('returns filtered and sorted directories for listDirs', () => {
    const policy = createPolicy();
    registerFsStoreIpcHandlers(policy);
    mockReaddirSync.mockReturnValue([
      { name: 'zeta', isDirectory: () => true },
      { name: 'alpha', isDirectory: () => true },
      { name: '.hidden', isDirectory: () => true },
      { name: 'file.txt', isDirectory: () => false },
    ]);

    const listDirs = getHandleHandler('fs:listDirs');
    const result = listDirs({}, '/repo', 'a');

    expect(result).toEqual([path.join(path.resolve('/repo'), 'alpha')]);
  });

  it('loads and saves state through sanitizer policy', () => {
    const policy = createPolicy();
    const loadedState = { projects: [] };
    const sanitized = { projects: [{ id: 'p1' }] };
    mockLoadState.mockReturnValue(loadedState);
    (policy.sanitizePersistedStateForSave as ReturnType<typeof vi.fn>).mockReturnValue(sanitized);
    registerFsStoreIpcHandlers(policy);

    const loadHandler = getHandleHandler('store:load');
    const saveHandler = getHandleHandler('store:save');

    expect(loadHandler({})).toEqual(loadedState);
    saveHandler({}, { projects: [{}] });

    expect(policy.sanitizePersistedStateForSave).toHaveBeenCalledWith({ projects: [{}] });
    expect(mockSaveState).toHaveBeenCalledWith(sanitized);
  });

  it('lists files via git and supports query ranking', () => {
    const policy = createPolicy({ isWithinKnownProject: vi.fn(() => true) });
    registerFsStoreIpcHandlers(policy);
    mockExecSync.mockReturnValue(
      ['src/app.ts', 'src/app-shell.ts', 'docs/app-notes.md', 'README.md'].join('\n'),
    );

    const listFiles = getHandleHandler('fs:listFiles');
    const result = listFiles({}, '/repo', 'app');

    expect(result).toEqual(['src/app.ts', 'src/app-shell.ts', 'docs/app-notes.md']);
    expect(mockExecSync).toHaveBeenCalled();
  });

  it('blocks and allows fs:readFile based on read policy', () => {
    const denyPolicy = createPolicy({ isAllowedReadPath: vi.fn(() => false) });
    registerFsStoreIpcHandlers(denyPolicy);
    const readFileHandler = getHandleHandler('fs:readFile');

    expect(readFileHandler({}, '/outside/file.txt')).toEqual({
      ok: false,
      reason: 'blocked',
      message: 'Path is not within an allowed read location',
    });
    expect(mockReadFileSync).not.toHaveBeenCalled();

    mockIpcHandle.mockClear();
    const allowPolicy = createPolicy({ isAllowedReadPath: vi.fn(() => true) });
    registerFsStoreIpcHandlers(allowPolicy);
    mockStatSync.mockReturnValue({ size: 12 });
    mockReadFileSync.mockReturnValue('hello');
    const allowedReadFileHandler = getHandleHandler('fs:readFile');

    expect(allowedReadFileHandler({}, '/repo/file.txt')).toEqual({ ok: true, content: 'hello' });
    expect(mockReadFileSync).toHaveBeenCalledWith(path.resolve('/repo/file.txt'), 'utf-8');
  });

  it('blocks fs:readFile when file exceeds max size', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = createPolicy({ isAllowedReadPath: vi.fn(() => true) });
    registerFsStoreIpcHandlers(policy);
    mockStatSync.mockReturnValue({ size: FS_READ_FILE_MAX_BYTES + 1 });
    const readFileHandler = getHandleHandler('fs:readFile');

    expect(readFileHandler({}, '/repo/large.txt')).toEqual({
      ok: false,
      reason: 'too-large',
      message: `File exceeds ${FS_READ_FILE_MAX_BYTES} bytes`,
    });
    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds'));
    warnSpy.mockRestore();
  });

  it('watches/unwatches files with resolved paths and attaches watcher window', () => {
    const policy = createPolicy({ isAllowedReadPath: vi.fn(() => true) });
    const win = { id: 123 };
    mockFromWebContents.mockReturnValue(win);
    registerFsStoreIpcHandlers(policy);

    const watchFile = getOnHandler('fs:watchFile');
    const unwatchFile = getOnHandler('fs:unwatchFile');
    const sender = {};

    watchFile({ sender }, './notes.md');
    unwatchFile({}, './notes.md');

    const resolved = path.resolve('./notes.md');
    expect(mockSetFileWatcherWindow).toHaveBeenCalledWith(win);
    expect(mockWatchFileForChanges).toHaveBeenCalledWith(resolved);
    expect(mockUnwatchFileForChanges).toHaveBeenCalledWith(resolved);
  });

  it('expands paths through fs:expandPath', () => {
    const policy = createPolicy();
    registerFsStoreIpcHandlers(policy);
    const expandPathHandler = getHandleHandler('fs:expandPath');

    const expanded = expandPathHandler({}, '~/project');
    expect(expanded).toBe('/home/test/project');
  });
});

