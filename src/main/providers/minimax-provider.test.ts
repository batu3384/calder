import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { isWin } from '../platform';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../pty-manager', () => ({
  getFullPath: vi.fn(() => isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin'),
}));

vi.mock('../minimax-config', () => ({
  getMiniMaxConfig: vi.fn(async () => ({ mcpServers: [], agents: [], skills: [], commands: [] })),
}));

vi.mock('../config-watcher', () => ({
  startConfigWatcher: vi.fn(),
  stopConfigWatcher: vi.fn(),
}));

import * as fs from 'fs';
import { execSync } from 'child_process';
import { MiniMaxProvider, _resetCachedPath } from './minimax-provider';
import { getMiniMaxConfig } from '../minimax-config';
import { startConfigWatcher, stopConfigWatcher } from '../config-watcher';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);
const mockGetMiniMaxConfig = vi.mocked(getMiniMaxConfig);
const mockStartConfigWatcher = vi.mocked(startConfigWatcher);
const mockStopConfigWatcher = vi.mocked(stopConfigWatcher);

let provider: MiniMaxProvider;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCachedPath();
  provider = new MiniMaxProvider();
});

describe('meta', () => {
  it('has correct id, displayName, and binaryName', () => {
    expect(provider.meta.id).toBe('minimax' as any);
    expect(provider.meta.displayName).toBe('MiniMax CLI');
    expect(provider.meta.binaryName).toBe('mmx');
  });

  it('enables config reading without unsupported resume or tracking claims', () => {
    expect(provider.meta.capabilities).toEqual({
      sessionResume: false,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    });
  });
});

describe('resolveBinaryPath', () => {
  const firstCandidate = isWin
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'mmx.cmd')
    : '/usr/local/bin/mmx';

  it('returns candidate path when existsSync returns true', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });

  it(`falls back to ${isWin ? 'where' : 'which'} mmx when no candidate exists`, () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/some/other/path/mmx\n' as any);
    expect(provider.resolveBinaryPath()).toBe('/some/other/path/mmx');
  });
});

describe('validatePrerequisites', () => {
  it('returns ok when binary found via which', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/resolved/mmx\n' as any);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns install guidance when binary is missing', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const result = provider.validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('MiniMax CLI not found');
    expect(result.message).toContain('mmx-cli');
  });
});

describe('buildEnv', () => {
  it('sets PATH to the augmented PATH and preserves existing env vars', () => {
    const env = provider.buildEnv('sess-123', { OTHER: 'val' });
    expect(env.PATH).toBe(isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin');
    expect(env.OTHER).toBe('val');
  });
});

describe('buildArgs', () => {
  it('starts a text chat command with the initial prompt', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['text', 'chat', '--message', 'fix the bug']);
  });

  it('combines extra args with text chat startup', () => {
    const args = provider.buildArgs({
      cliSessionId: null,
      isResume: false,
      extraArgs: '--model MiniMax-M2.7-highspeed --stream',
      initialPrompt: 'fix the bug',
    });
    expect(args).toEqual(['text', 'chat', '--message', 'fix the bug', '--model', 'MiniMax-M2.7-highspeed', '--stream']);
  });

  it('ignores resume mode because MiniMax CLI has no verified resume support', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['text', 'chat']);
  });
});

describe('settings and config', () => {
  it('supports inert install hooks and status script methods without throwing', async () => {
    await expect(provider.installHooks()).resolves.toBeUndefined();
    expect(() => provider.installStatusScripts()).not.toThrow();
  });

  it('reports no hook/status integration surface', () => {
    expect(provider.validateSettings()).toEqual({ statusLine: 'missing', hooks: 'missing', hookDetails: {} });
  });

  it('returns null shift-enter sequence because minimax has no special key mapping', () => {
    expect(provider.getShiftEnterSequence()).toBeNull();
  });

  it('returns parsed provider config', async () => {
    const config = {
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    };
    mockGetMiniMaxConfig.mockResolvedValueOnce(config);
    await expect(provider.getConfig('/some/path')).resolves.toEqual(config);
    expect(mockGetMiniMaxConfig).toHaveBeenCalledWith('/some/path');
  });
});

describe('watchers and cleanup', () => {
  it('starts a minimax config watcher', () => {
    const win = { id: 1 } as any;
    provider.startConfigWatcher(win, '/project');
    expect(mockStartConfigWatcher).toHaveBeenCalledWith(win, '/project', 'minimax');
  });

  it('cleanup stops config watching', () => {
    provider.cleanup();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
  });

  it('stopConfigWatcher delegates to config watcher stop', () => {
    provider.stopConfigWatcher();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
  });

  it('reinstallSettings remains a safe no-op', () => {
    expect(() => provider.reinstallSettings()).not.toThrow();
  });
});
