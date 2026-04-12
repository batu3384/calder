import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockIpcMainOnce,
  mockIpcMainRemoveListener,
  mockReadJsonSafe,
  mockLoadState,
  mockSaveState,
} = vi.hoisted(() => ({
  mockIpcMainOnce: vi.fn(),
  mockIpcMainRemoveListener: vi.fn(),
  mockReadJsonSafe: vi.fn(() => ({})),
  mockLoadState: vi.fn(() => ({
    version: 1,
    projects: [],
    activeProjectId: null,
    preferences: {},
  })),
  mockSaveState: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { once: mockIpcMainOnce, removeListener: mockIpcMainRemoveListener },
  BrowserWindow: {},
}));

vi.mock('./hook-status', () => ({
  getStatusLineScriptPath: () => '/mock/home/.calder/runtime/statusline.sh',
}));

vi.mock('./claude-cli', () => ({
  HOOK_MARKER: '# calder-hook',
  installHooksOnly: vi.fn(),
  installStatusLine: vi.fn(),
}));

vi.mock('./fs-utils', () => ({
  readJsonSafe: mockReadJsonSafe,
  expandUserPath: (value: string) => value.replace(/^~(?=\/|$)/, '/mock/home'),
}));

vi.mock('./store', () => ({
  loadState: mockLoadState,
  saveState: mockSaveState,
}));

import { installHooksOnly, installStatusLine } from './claude-cli';
import { guardedInstall, isCalderStatusLine, reinstallSettings } from './settings-guard';

const mockInstallHooksOnly = vi.mocked(installHooksOnly);
const mockInstallStatusLine = vi.mocked(installStatusLine);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadJsonSafe.mockReturnValue({});
  mockLoadState.mockReturnValue({
    version: 1,
    projects: [],
    activeProjectId: null,
    preferences: {},
  });
});

describe('isCalderStatusLine', () => {
  it('accepts the current Calder status line command', () => {
    expect(isCalderStatusLine({ command: '/mock/home/.calder/runtime/statusline.sh' })).toBe(true);
  });

  it('accepts quoted managed commands', () => {
    expect(isCalderStatusLine({ command: '"/mock/home/.calder/runtime/statusline.sh"' })).toBe(true);
  });

  it('accepts wrapper commands that execute the managed script', () => {
    expect(isCalderStatusLine({ command: 'sh -lc \'/mock/home/.calder/runtime/statusline.sh\'' })).toBe(true);
  });

  it('rejects the managed helper path directly', () => {
    expect(isCalderStatusLine({ command: '/mock/home/.calder/runtime/statusline.py' })).toBe(false);
  });

  it('rejects an unknown status line command', () => {
    expect(isCalderStatusLine({ command: '/tmp/oldapp/statusline.sh' })).toBe(false);
  });
});

describe('guardedInstall conflict flow', () => {
  function makeWindow() {
    return {
      webContents: {
        isLoading: vi.fn(() => false),
        once: vi.fn(),
        send: vi.fn(),
      },
      once: vi.fn(),
      removeListener: vi.fn(),
    };
  }

  it('does not show a conflict modal when the configured command is already Calder-managed', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '"/mock/home/.calder/runtime/statusline.sh"' },
    });
    const win = makeWindow();

    await guardedInstall(win as any);

    expect(win.webContents.send).not.toHaveBeenCalledWith('settings:showConflictDialog', expect.anything());
    expect(mockIpcMainOnce).not.toHaveBeenCalled();
    expect(mockInstallStatusLine).toHaveBeenCalled();
  });

  it('shows a conflict modal only for a real foreign command and keeps the existing command when requested', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });
    const win = makeWindow();
    let responseHandler: ((event: unknown, choice: string) => void) | undefined;
    mockIpcMainOnce.mockImplementation((_channel, cb) => {
      responseHandler = cb;
    });

    const installPromise = guardedInstall(win as any);
    expect(win.webContents.send).toHaveBeenCalledWith('settings:showConflictDialog', {
      foreignCommand: '/tmp/other/statusline.sh',
    });

    responseHandler?.({}, 'keep');
    await installPromise;

    expect(mockInstallStatusLine).not.toHaveBeenCalled();
    expect(mockSaveState).toHaveBeenCalledWith(expect.objectContaining({
      preferences: expect.objectContaining({ statusLineConsent: 'declined' }),
    }));
  });

  it('installs Calder status line when the user chooses Use Calder', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });
    const win = makeWindow();
    let responseHandler: ((event: unknown, choice: string) => void) | undefined;
    mockIpcMainOnce.mockImplementation((_channel, cb) => {
      responseHandler = cb;
    });

    const installPromise = guardedInstall(win as any);
    responseHandler?.({}, 'replace');
    await installPromise;

    expect(mockInstallStatusLine).toHaveBeenCalled();
    expect(mockSaveState).toHaveBeenCalledWith(expect.objectContaining({
      preferences: expect.objectContaining({ statusLineConsent: 'granted' }),
    }));
  });
});

describe('settings install failures', () => {
  it('does not reject app startup when hook installation cannot write settings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInstallHooksOnly.mockImplementation(() => {
      throw new Error('EPERM');
    });

    await expect(guardedInstall(null)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not throw when reinstalling settings against an immutable settings file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInstallHooksOnly.mockImplementation(() => {
      throw new Error('EPERM');
    });
    mockInstallStatusLine.mockImplementation(() => {
      throw new Error('EPERM');
    });

    expect(() => reinstallSettings()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
