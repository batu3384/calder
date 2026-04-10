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

import { isCalderStatusLine } from './settings-guard';

describe('isCalderStatusLine', () => {
  it('accepts the current Calder status line command', () => {
    expect(isCalderStatusLine({ command: '/tmp/calder/statusline.sh' })).toBe(true);
  });

  it('rejects an unknown status line command', () => {
    expect(isCalderStatusLine({ command: '/tmp/oldapp/statusline.sh' })).toBe(false);
  });
});
