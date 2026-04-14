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
import { guardedInstall, isCalderStatusLine, reinstallSettings, validateSettings } from './settings-guard';

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

  it('installs status line directly when no status line exists', async () => {
    mockReadJsonSafe.mockReturnValue({});
    const win = makeWindow();

    await guardedInstall(win as any);

    expect(mockInstallStatusLine).toHaveBeenCalled();
    expect(mockIpcMainOnce).not.toHaveBeenCalled();
  });

  it('uses stored granted consent without showing modal', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });
    mockLoadState.mockReturnValue({
      version: 1,
      projects: [],
      activeProjectId: null,
      preferences: { statusLineConsent: 'granted' },
    });

    const win = makeWindow();
    await guardedInstall(win as any);

    expect(mockInstallStatusLine).toHaveBeenCalled();
    expect(mockIpcMainOnce).not.toHaveBeenCalled();
  });

  it('respects stored declined consent and skips replacement', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });
    mockLoadState.mockReturnValue({
      version: 1,
      projects: [],
      activeProjectId: null,
      preferences: { statusLineConsent: 'declined' },
    });

    const win = makeWindow();
    await guardedInstall(win as any);

    expect(mockInstallStatusLine).not.toHaveBeenCalled();
    expect(mockIpcMainOnce).not.toHaveBeenCalled();
  });

  it('returns safely when foreign status line exists but window is unavailable', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });

    await guardedInstall(null);

    expect(mockInstallHooksOnly).toHaveBeenCalled();
    expect(mockInstallStatusLine).not.toHaveBeenCalled();
    expect(mockIpcMainOnce).not.toHaveBeenCalled();
  });

  it('waits for did-finish-load before showing conflict dialog', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });

    let finishLoadCb: (() => void) | undefined;
    let responseHandler: ((event: unknown, choice: string) => void) | undefined;
    const win = {
      webContents: {
        isLoading: vi.fn(() => true),
        once: vi.fn((_event: string, cb: () => void) => { finishLoadCb = cb; }),
        send: vi.fn(),
      },
      once: vi.fn(),
      removeListener: vi.fn(),
    };
    mockIpcMainOnce.mockImplementation((_channel, cb) => {
      responseHandler = cb;
    });

    const installPromise = guardedInstall(win as any);
    expect(win.webContents.send).not.toHaveBeenCalled();

    finishLoadCb?.();
    await Promise.resolve();
    expect(win.webContents.send).toHaveBeenCalledWith('settings:showConflictDialog', {
      foreignCommand: '/tmp/other/statusline.sh',
    });

    responseHandler?.({}, 'keep');
    await installPromise;
  });

  it('treats window close as keep decision and unregisters response listener', async () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/tmp/other/statusline.sh' },
    });

    let closeHandler: (() => void) | undefined;
    const win = {
      webContents: {
        isLoading: vi.fn(() => false),
        once: vi.fn(),
        send: vi.fn(),
      },
      once: vi.fn((_event: string, cb: () => void) => { closeHandler = cb; }),
      removeListener: vi.fn(),
    };

    const installPromise = guardedInstall(win as any);
    closeHandler?.();
    await installPromise;

    expect(mockIpcMainRemoveListener).toHaveBeenCalledWith('settings:conflictDialogResponse', expect.any(Function));
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

  it('logs status line install failures with non-Error throw values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInstallStatusLine.mockImplementation(() => {
      throw 'permission-denied';
    });

    await expect(guardedInstall(null)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('permission-denied'));
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
    expect(mockSaveState).toHaveBeenCalledWith(expect.objectContaining({
      preferences: expect.objectContaining({ statusLineConsent: 'granted' }),
    }));
    warn.mockRestore();
  });
});

describe('validateSettings', () => {
  const events = [
    'SessionStart',
    'UserPromptSubmit',
    'PostToolUse',
    'PostToolUseFailure',
    'Stop',
    'StopFailure',
    'PermissionRequest',
  ] as const;

  it('reports full hook coverage and managed status line', () => {
    const hooks = Object.fromEntries(
      events.map((event) => [event, [{ hooks: [{ command: `echo "# calder-hook:${event}"` }] }]]),
    );
    mockReadJsonSafe.mockReturnValue({
      statusLine: { command: '/mock/home/.calder/runtime/statusline.sh' },
      hooks,
    });

    const result = validateSettings();
    expect(result.statusLine).toBe('calder');
    expect(result.hooks).toBe('complete');
    expect(Object.values(result.hookDetails).every(Boolean)).toBe(true);
  });

  it('reports foreign status line and partial hooks with fallback command extraction', () => {
    mockReadJsonSafe.mockReturnValue({
      statusLine: { url: 'https://example.invalid/status' },
      hooks: {
        SessionStart: [{ hooks: [{ command: 'run # calder-hook' }] }],
      },
    });

    const result = validateSettings();
    expect(result.statusLine).toBe('foreign');
    expect(result.foreignStatusLineCommand).toBe('https://example.invalid/status');
    expect(result.hooks).toBe('partial');
    expect(result.hookDetails.SessionStart).toBe(true);
    expect(result.hookDetails.Stop).toBe(false);
  });

  it('returns missing states when settings payload is empty or malformed', () => {
    mockReadJsonSafe.mockReturnValue(null as any);

    const result = validateSettings();
    expect(result.statusLine).toBe('missing');
    expect(result.hooks).toBe('missing');
    expect(Object.values(result.hookDetails).every((installed) => installed === false)).toBe(true);
  });
});
