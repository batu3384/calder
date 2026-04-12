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

vi.mock('../blackbox-config', () => ({
  getBlackboxConfig: vi.fn(async () => ({ mcpServers: [], agents: [], skills: [], commands: [] })),
  findBlackboxTranscriptPath: vi.fn(() => null),
}));

vi.mock('../config-watcher', () => ({
  startConfigWatcher: vi.fn(),
  stopConfigWatcher: vi.fn(),
}));

vi.mock('../blackbox-session-watcher', () => ({
  stopBlackboxSessionWatcher: vi.fn(),
}));

import * as fs from 'fs';
import { execSync } from 'child_process';
import { BlackboxProvider, _resetCachedPath } from './blackbox-provider';
import { getBlackboxConfig, findBlackboxTranscriptPath } from '../blackbox-config';
import { startConfigWatcher, stopConfigWatcher } from '../config-watcher';
import { stopBlackboxSessionWatcher } from '../blackbox-session-watcher';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);
const mockGetBlackboxConfig = vi.mocked(getBlackboxConfig);
const mockFindBlackboxTranscriptPath = vi.mocked(findBlackboxTranscriptPath);
const mockStartConfigWatcher = vi.mocked(startConfigWatcher);
const mockStopConfigWatcher = vi.mocked(stopConfigWatcher);
const mockStopBlackboxSessionWatcher = vi.mocked(stopBlackboxSessionWatcher);

let provider: BlackboxProvider;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCachedPath();
  provider = new BlackboxProvider();
});

describe('meta', () => {
  it('has correct id, displayName, and binaryName', () => {
    expect(provider.meta.id).toBe('blackbox');
    expect(provider.meta.displayName).toBe('Blackbox CLI');
    expect(provider.meta.binaryName).toBe('blackbox');
  });

  it('enables resume and config reading for session parity', () => {
    expect(provider.meta.capabilities).toEqual({
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
      planModeArg: '--approval-mode=plan',
    });
  });
});

describe('resolveBinaryPath', () => {
  const firstCandidate = isWin
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'blackbox.cmd')
    : '/usr/local/bin/blackbox';

  it('returns candidate path when existsSync returns true', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });

  it(`falls back to ${isWin ? 'where' : 'which'} blackbox when no candidate exists`, () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/some/other/path/blackbox\n' as any);
    expect(provider.resolveBinaryPath()).toBe('/some/other/path/blackbox');
  });
});

describe('validatePrerequisites', () => {
  it('returns ok when binary found via which', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/resolved/blackbox\n' as any);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns official install guidance when binary is missing', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    const result = provider.validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Blackbox CLI not found');
    expect(result.message).toContain('Calder can launch sessions with Blackbox CLI');
    expect(result.message).not.toContain('Calder requires the Blackbox CLI');
    expect(result.message).toContain('https://blackbox.ai/install.sh');
  });
});

describe('buildEnv', () => {
  it('sets PATH to the augmented PATH and preserves existing env vars', () => {
    const env = provider.buildEnv('sess-123', { BLACKBOX_API_KEY: 'key', OTHER: 'val' });
    expect(env.PATH).toBe(isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin');
    expect(env.BLACKBOX_API_KEY).toBe('key');
    expect(env.OTHER).toBe('val');
  });
});

describe('buildArgs', () => {
  it('resumes a known checkpoint-backed session', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '' });
    expect(args).toEqual(['--resume-checkpoint', 'session-sid-1']);
  });

  it('starts interactively with the initial prompt via -i', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['-i', 'fix the bug']);
  });

  it('combines extra args with prompt-interactive startup', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '--model blackboxai/pro  --yolo', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['--model', 'blackboxai/pro', '--yolo', '-i', 'fix the bug']);
  });
});

describe('settings and config', () => {
  it('still reports no hook/status integration surface', () => {
    expect(provider.validateSettings()).toEqual({ statusLine: 'missing', hooks: 'missing', hookDetails: {} });
  });

  it('returns parsed provider config', async () => {
    const config = {
      mcpServers: [{ name: 'github', url: 'docker', status: 'configured', scope: 'user' as const, filePath: '/tmp/settings.json' }],
      agents: [],
      skills: [],
      commands: [],
    };
    mockGetBlackboxConfig.mockResolvedValueOnce(config);
    await expect(provider.getConfig('/some/path')).resolves.toEqual(config);
    expect(mockGetBlackboxConfig).toHaveBeenCalledWith('/some/path');
  });

  it('returns the best transcript path for archived handoff', () => {
    mockFindBlackboxTranscriptPath.mockReturnValueOnce('/mock/home/.blackboxcli/tmp/project/checkpoint-session-sid-1.json');
    expect(provider.getTranscriptPath('sid-1', '/project')).toBe('/mock/home/.blackboxcli/tmp/project/checkpoint-session-sid-1.json');
    expect(mockFindBlackboxTranscriptPath).toHaveBeenCalledWith('sid-1', '/project');
  });
});

describe('watchers and cleanup', () => {
  it('starts a blackbox config watcher', () => {
    const win = { id: 1 } as any;
    provider.startConfigWatcher(win, '/project');
    expect(mockStartConfigWatcher).toHaveBeenCalledWith(win, '/project', 'blackbox');
  });

  it('cleanup stops config watching and the session watcher', () => {
    provider.cleanup();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
    expect(mockStopBlackboxSessionWatcher).toHaveBeenCalled();
  });

  it('reinstallSettings remains a safe no-op', () => {
    expect(() => provider.reinstallSettings()).not.toThrow();
  });
});
