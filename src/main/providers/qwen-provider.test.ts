import { vi } from 'vitest';
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

vi.mock('../qwen-config', () => ({
  getQwenConfig: vi.fn(async () => ({ mcpServers: [], agents: [], skills: [], commands: [] })),
  findQwenTranscriptPath: vi.fn(() => null),
}));

vi.mock('../qwen-hooks', () => ({
  installQwenHooks: vi.fn(),
  validateQwenHooks: vi.fn(() => ({ statusLine: 'calder', hooks: 'complete', hookDetails: {} })),
  cleanupQwenHooks: vi.fn(),
  SESSION_ID_VAR: 'CALDER_SESSION_ID',
}));

vi.mock('../config-watcher', () => ({
  startConfigWatcher: vi.fn(),
  stopConfigWatcher: vi.fn(),
}));

vi.mock('../hook-status', () => ({
  installStatusLineScript: vi.fn(),
}));

import * as fs from 'fs';
import { execSync } from 'child_process';
import { QwenProvider, _resetCachedPath } from './qwen-provider';
import { getQwenConfig, findQwenTranscriptPath } from '../qwen-config';
import { installQwenHooks, validateQwenHooks, cleanupQwenHooks } from '../qwen-hooks';
import { startConfigWatcher, stopConfigWatcher } from '../config-watcher';
import { installStatusLineScript } from '../hook-status';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);
const mockGetQwenConfig = vi.mocked(getQwenConfig);
const mockFindQwenTranscriptPath = vi.mocked(findQwenTranscriptPath);
const mockInstallQwenHooks = vi.mocked(installQwenHooks);
const mockValidateQwenHooks = vi.mocked(validateQwenHooks);
const mockCleanupQwenHooks = vi.mocked(cleanupQwenHooks);
const mockStartConfigWatcher = vi.mocked(startConfigWatcher);
const mockStopConfigWatcher = vi.mocked(stopConfigWatcher);
const mockInstallStatusLineScript = vi.mocked(installStatusLineScript);

let provider: QwenProvider;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCachedPath();
  provider = new QwenProvider();
});

describe('meta', () => {
  it('has correct id, displayName, and binaryName', () => {
    expect(provider.meta.id).toBe('qwen');
    expect(provider.meta.displayName).toBe('Qwen Code');
    expect(provider.meta.binaryName).toBe('qwen');
  });

  it('enables session resume, hooks, and config reading parity', () => {
    expect(provider.meta.capabilities).toEqual({
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
      planModeArg: '--approval-mode=plan',
    });
  });

  it('uses a large default context window estimate', () => {
    expect(provider.meta.defaultContextWindowSize).toBe(1_000_000);
  });
});

describe('resolveBinaryPath', () => {
  const firstCandidate = isWin
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'qwen.cmd')
    : '/usr/local/bin/qwen';

  it('returns candidate path when existsSync returns true', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });

  it(`falls back to ${isWin ? 'where' : 'which'} qwen when no candidate exists`, () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/some/other/path/qwen\n' as any);
    expect(provider.resolveBinaryPath()).toBe('/some/other/path/qwen');
  });

  it('falls back to bare "qwen" when both candidate and which fail', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(provider.resolveBinaryPath()).toBe('qwen');
  });
});

describe('validatePrerequisites', () => {
  it('returns ok when binary found via which', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/resolved/qwen\n' as any);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns not ok when binary not found anywhere', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    const result = provider.validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Qwen Code not found');
    expect(result.message).toContain('@qwen-code/qwen-code');
  });
});

describe('buildEnv', () => {
  it('sets PATH to the augmented PATH and preserves existing env vars', () => {
    const env = provider.buildEnv('sess-123', { OTHER: 'val' });
    expect(env.PATH).toBe(isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin');
    expect(env.CALDER_SESSION_ID).toBe('sess-123');
    expect(env.OTHER).toBe('val');
  });
});

describe('buildArgs', () => {
  it('resumes a known Qwen session with -r', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '' });
    expect(args).toEqual(['-r', 'sid-1']);
  });

  it('starts interactively with the initial prompt via -i', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['-i', 'fix the bug']);
  });

  it('combines extra args with prompt-interactive startup', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '--model qwen3-coder  --yolo', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['--model', 'qwen3-coder', '--yolo', '-i', 'fix the bug']);
  });

  it('does not pass initialPrompt while resuming', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['-r', 'sid-1']);
  });
});

describe('hooks and config integration', () => {
  it('installs hooks via the Qwen hook manager', async () => {
    await provider.installHooks();
    expect(mockInstallQwenHooks).toHaveBeenCalled();
  });

  it('installs the managed status line runtime assets', () => {
    provider.installStatusScripts();
    expect(mockInstallStatusLineScript).toHaveBeenCalled();
  });

  it('delegates settings validation to the Qwen hook validator', () => {
    const result = provider.validateSettings();
    expect(mockValidateQwenHooks).toHaveBeenCalled();
    expect(result).toEqual({ statusLine: 'calder', hooks: 'complete', hookDetails: {} });
  });

  it('reinstalls hooks and statusline assets together', () => {
    provider.reinstallSettings();
    expect(mockInstallQwenHooks).toHaveBeenCalled();
    expect(mockInstallStatusLineScript).toHaveBeenCalled();
  });

  it('cleanup stops config watching and removes managed hooks', () => {
    provider.cleanup();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
    expect(mockCleanupQwenHooks).toHaveBeenCalled();
  });

  it('starts a qwen config watcher', () => {
    const win = { id: 1 } as any;
    provider.startConfigWatcher(win, '/project');
    expect(mockStartConfigWatcher).toHaveBeenCalledWith(win, '/project', 'qwen');
  });
});

describe('provider config and transcripts', () => {
  it('returns parsed provider config', async () => {
    const config = {
      mcpServers: [{ name: 'test', url: 'http://localhost:3000', status: 'configured', scope: 'user' as const, filePath: '/tmp/settings.json' }],
      agents: [],
      skills: [],
      commands: [],
    };
    mockGetQwenConfig.mockResolvedValueOnce(config);
    await expect(provider.getConfig('/some/path')).resolves.toEqual(config);
    expect(mockGetQwenConfig).toHaveBeenCalledWith('/some/path');
  });

  it('returns the discovered transcript path for archived handoff', () => {
    mockFindQwenTranscriptPath.mockReturnValueOnce('/mock/home/.qwen/projects/demo/chats/sid-1.jsonl');
    expect(provider.getTranscriptPath('sid-1', '/project')).toBe('/mock/home/.qwen/projects/demo/chats/sid-1.jsonl');
    expect(mockFindQwenTranscriptPath).toHaveBeenCalledWith('sid-1', '/project');
  });
});

describe('getShiftEnterSequence', () => {
  it('returns null', () => {
    expect(provider.getShiftEnterSequence()).toBeNull();
  });
});

