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
import { QwenProvider, _resetCachedPath } from './qwen-provider';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);

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

  it('uses startup prompts without enabling unimplemented hook/status features', () => {
    expect(provider.meta.capabilities).toEqual({
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: false,
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

describe('settings and config', () => {
  it('returns inert settings validation because hooks are not installed by Calder yet', () => {
    expect(provider.validateSettings()).toEqual({ statusLine: 'missing', hooks: 'missing', hookDetails: {} });
  });

  it('returns an empty provider config', async () => {
    await expect(provider.getConfig('/some/path')).resolves.toEqual({ mcpServers: [], agents: [], skills: [], commands: [] });
  });
});

