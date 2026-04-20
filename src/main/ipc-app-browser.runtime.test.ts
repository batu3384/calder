import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn());
const mockAppFocus = vi.hoisted(() => vi.fn());
const mockAppVersion = vi.hoisted(() => vi.fn(() => '1.2.3'));
const mockOpenExternal = vi.hoisted(() => vi.fn());
const mockWebContentsFromId = vi.hoisted(() => vi.fn());

const mockMkdir = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockReaddir = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());
const mockUnlink = vi.hoisted(() => vi.fn());
const mockTmpdir = vi.hoisted(() => vi.fn(() => '/tmp'));

const mockDiscoverLocalBrowserTargets = vi.hoisted(() => vi.fn());
const mockListBrowserCredentialSummariesForUrl = vi.hoisted(() => vi.fn());
const mockSaveBrowserCredentialForUrl = vi.hoisted(() => vi.fn());
const mockDeleteBrowserCredentialById = vi.hoisted(() => vi.fn());
const mockGetBrowserCredentialForFill = vi.hoisted(() => vi.fn());
const mockGetBrowserAutoFillCredentialForUrl = vi.hoisted(() => vi.fn());
const mockOpenUrlWithBrowserPolicy = vi.hoisted(() => vi.fn());
const mockGetPtyCwd = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
  app: {
    focus: mockAppFocus,
    getVersion: mockAppVersion,
  },
  shell: {
    openExternal: mockOpenExternal,
  },
  webContents: {
    fromId: mockWebContentsFromId,
  },
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readdir: mockReaddir,
    stat: mockStat,
    unlink: mockUnlink,
  },
}));

vi.mock('os', () => ({
  tmpdir: mockTmpdir,
}));

vi.mock('./local-dev-targets', () => ({
  discoverLocalBrowserTargets: mockDiscoverLocalBrowserTargets,
}));

vi.mock('./browser-credential-vault', () => ({
  listBrowserCredentialSummariesForUrl: mockListBrowserCredentialSummariesForUrl,
  saveBrowserCredentialForUrl: mockSaveBrowserCredentialForUrl,
  deleteBrowserCredentialById: mockDeleteBrowserCredentialById,
  getBrowserCredentialForFill: mockGetBrowserCredentialForFill,
  getBrowserAutoFillCredentialForUrl: mockGetBrowserAutoFillCredentialForUrl,
}));

vi.mock('./browser-open-policy', () => ({
  openUrlWithBrowserPolicy: mockOpenUrlWithBrowserPolicy,
}));

vi.mock('./pty-manager', () => ({
  getPtyCwd: mockGetPtyCwd,
}));

import { registerAppBrowserIpcHandlers } from './ipc-app-browser';

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

describe('ipc app/browser runtime handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenUrlWithBrowserPolicy.mockResolvedValue({ opened: true });
    mockReaddir.mockResolvedValue([]);
    mockGetAllWindows.mockReturnValue([]);
  });

  it('focuses app and restores/focuses the first window when available', () => {
    const win = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      focus: vi.fn(),
    };
    mockGetAllWindows.mockReturnValue([win]);
    registerAppBrowserIpcHandlers({
      requireKnownProjectPath: vi.fn((value) => value),
      getActiveProjectPath: vi.fn(() => '/repo'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    });

    const focusHandler = getOnHandler('app:focus');
    focusHandler({});

    expect(mockAppFocus).toHaveBeenCalledWith({ steal: true });
    expect(win.restore).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('guards app:sendToGuestWebContents and dispatches only valid webview messages', () => {
    registerAppBrowserIpcHandlers({
      requireKnownProjectPath: vi.fn((value) => value),
      getActiveProjectPath: vi.fn(() => '/repo'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    });

    const handler = getHandleHandler('app:sendToGuestWebContents');
    expect(handler({}, 1, 'unknown-channel')).toBe(false);
    expect(handler({}, 1, 'enter-inspect-mode', { bad: true })).toBe(false);

    mockWebContentsFromId.mockReturnValueOnce(undefined);
    expect(handler({}, 1, 'enter-inspect-mode')).toBe(false);

    mockWebContentsFromId.mockReturnValueOnce({
      isDestroyed: () => false,
      getType: () => 'window',
      send: vi.fn(),
    });
    expect(handler({}, 1, 'enter-inspect-mode')).toBe(false);

    const send = vi.fn();
    mockWebContentsFromId.mockReturnValueOnce({
      isDestroyed: () => false,
      getType: () => 'webview',
      send,
    });
    expect(handler({}, 1, 'auth-fill-credentials', { username: 'u', password: 'p' })).toBe(true);
    expect(send).toHaveBeenCalledWith('auth-fill-credentials', { username: 'u', password: 'p' });
  });

  it('validates app:openExternal protocol and governance checks', async () => {
    const ops = {
      requireKnownProjectPath: vi.fn((value: string) => value),
      getActiveProjectPath: vi.fn(() => '/repo-active'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    };
    const win = { isDestroyed: () => false };
    mockGetAllWindows.mockReturnValue([win]);
    registerAppBrowserIpcHandlers(ops);
    const openExternal = getHandleHandler('app:openExternal');

    await openExternal({}, 'https://example.com/docs', '/repo');
    expect(ops.requireKnownProjectPath).toHaveBeenCalledWith('/repo', 'Open external URL');
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', {
      kind: 'network',
      label: 'Open external URL',
      target: 'example.com',
    });
    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledWith(
      { url: 'https://example.com/docs', cwd: '/repo', preferEmbedded: true },
      win,
      expect.any(Function),
    );

    await openExternal({}, 'https://openai.com');
    expect(ops.getActiveProjectPath).toHaveBeenCalled();
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo-active', {
      kind: 'network',
      label: 'Open external URL',
      target: 'openai.com',
    });

    await expect(openExternal({}, 'file:///etc/passwd')).rejects.toThrow('Only HTTP(S) URLs are allowed');
  });

  it('saves browser screenshots with data-url validation and delegates utility handlers', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerAppBrowserIpcHandlers({
      requireKnownProjectPath: vi.fn((value) => value),
      getActiveProjectPath: vi.fn(() => '/repo'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    });
    const saveScreenshot = getHandleHandler('browser:saveScreenshot');
    const listTargets = getHandleHandler('browser:listLocalTargets');
    const getVersion = getHandleHandler('app:getVersion');
    const getBrowserPreloadPath = getHandleHandler('app:getBrowserPreloadPath');
    const getPtyCwd = getHandleHandler('pty:getCwd');

    mockDiscoverLocalBrowserTargets.mockResolvedValue([{ url: 'http://localhost:3000' }]);
    mockGetPtyCwd.mockReturnValue('/repo');
    mockReaddir.mockResolvedValueOnce(['stale.png', 'broken.png']);
    mockStat
      .mockResolvedValueOnce({ mtimeMs: 0 })
      .mockRejectedValueOnce(new Error('stat failed'));

    const filePath = await saveScreenshot({}, 'session/1', 'data:image/png;base64,aGVsbG8=');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockMkdir).toHaveBeenCalledWith('/tmp/calder-screenshots', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/calder-screenshots/stale.png');
    expect(warnSpy).toHaveBeenCalledWith('Failed to prune screenshot', '/tmp/calder-screenshots/broken.png', expect.any(Error));
    expect(filePath).toContain('/tmp/calder-screenshots/draw-session_1-1700000000000.png');
    await expect(saveScreenshot({}, 's', 'data:text/plain;base64,abc')).rejects.toThrow(
      'Invalid screenshot data URL',
    );

    expect(await listTargets({})).toEqual([{ url: 'http://localhost:3000' }]);
    expect(getVersion({})).toBe('1.2.3');
    expect(getBrowserPreloadPath({})).toContain('/preload/preload/browser-tab-preload.js');
    expect(getPtyCwd({}, 'session-1')).toBe('/repo');

    warnSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('warns when screenshot prune cannot read the temporary directory', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dirError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mockReaddir.mockRejectedValueOnce(dirError);

    const { registerAppBrowserIpcHandlers: registerHandlersFresh } = await import('./ipc-app-browser');
    registerHandlersFresh({
      requireKnownProjectPath: vi.fn((value) => value),
      getActiveProjectPath: vi.fn(() => '/repo'),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
    });

    const saveScreenshot = getHandleHandler('browser:saveScreenshot');
    await saveScreenshot({}, 'session-prune-error', 'data:image/png;base64,aGVsbG8=');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalledWith('Failed to read screenshots dir for pruning', dirError);
    warnSpy.mockRestore();
  });
});
