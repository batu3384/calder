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

import * as fs from 'fs';
import { execSync } from 'child_process';
import { BlackboxProvider, _resetCachedPath } from './blackbox-provider';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);

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

  it('uses startup prompts without claiming per-session resume or hook/status support', () => {
    expect(provider.meta.capabilities).toEqual({
      sessionResume: false,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: false,
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
  it('does not attempt Calder per-session resume for Blackbox', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '' });
    expect(args).toEqual([]);
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
  it('returns inert settings validation because hooks are not installed by Calder', () => {
    expect(provider.validateSettings()).toEqual({ statusLine: 'missing', hooks: 'missing', hookDetails: {} });
  });

  it('returns an empty provider config', async () => {
    await expect(provider.getConfig('/some/path')).resolves.toEqual({ mcpServers: [], agents: [], skills: [], commands: [] });
  });
});

