import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { once: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: {},
}));

vi.mock('./hook-status', () => ({
  getStatusLineScriptPath: () => '/tmp/calder/statusline.sh',
}));

vi.mock('./claude-cli', () => ({
  HOOK_MARKER: '# calder-hook',
  installHooksOnly: vi.fn(),
  installStatusLine: vi.fn(),
}));

vi.mock('./fs-utils', () => ({
  readJsonSafe: vi.fn(() => ({})),
}));

vi.mock('./store', () => ({
  loadState: vi.fn(() => ({
    version: 1,
    projects: [],
    activeProjectId: null,
    preferences: {},
  })),
  saveState: vi.fn(),
}));

import { installHooksOnly, installStatusLine } from './claude-cli';
import { guardedInstall, isCalderStatusLine, reinstallSettings } from './settings-guard';

const mockInstallHooksOnly = vi.mocked(installHooksOnly);
const mockInstallStatusLine = vi.mocked(installStatusLine);

describe('isCalderStatusLine', () => {
  it('accepts the current Calder status line command', () => {
    expect(isCalderStatusLine({ command: '/tmp/calder/statusline.sh' })).toBe(true);
  });

  it('rejects the managed helper path directly', () => {
    expect(isCalderStatusLine({ command: '/tmp/calder/statusline.py' })).toBe(false);
  });

  it('rejects an unknown status line command', () => {
    expect(isCalderStatusLine({ command: '/tmp/oldapp/statusline.sh' })).toBe(false);
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
