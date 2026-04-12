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

vi.mock('../copilot-config', () => ({
  getCopilotConfig: vi.fn(async () => ({ mcpServers: [], agents: [], skills: [], commands: [] })),
}));

vi.mock('../config-watcher', () => ({
  startConfigWatcher: vi.fn(),
  stopConfigWatcher: vi.fn(),
}));

import * as fs from 'fs';
import { execSync } from 'child_process';
import { CopilotProvider, _resetCachedPath } from './copilot-provider';
import { getCopilotConfig } from '../copilot-config';
import { startConfigWatcher, stopConfigWatcher } from '../config-watcher';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);
const mockGetCopilotConfig = vi.mocked(getCopilotConfig);
const mockStartConfigWatcher = vi.mocked(startConfigWatcher);
const mockStopConfigWatcher = vi.mocked(stopConfigWatcher);

let provider: CopilotProvider;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCachedPath();
  provider = new CopilotProvider();
});

describe('meta', () => {
  it('has correct id, displayName, and binaryName', () => {
    expect(provider.meta.id).toBe('copilot');
    expect(provider.meta.displayName).toBe('GitHub Copilot');
    expect(provider.meta.binaryName).toBe('copilot');
  });

  it('enables resume and config reading without hook tracking claims', () => {
    expect(provider.meta.capabilities).toEqual({
      sessionResume: true,
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
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'copilot.cmd')
    : '/usr/local/bin/copilot';

  it('returns candidate path when existsSync returns true', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });

  it(`falls back to ${isWin ? 'where' : 'which'} copilot when no candidate exists`, () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/some/other/path/copilot\n' as any);
    expect(provider.resolveBinaryPath()).toBe('/some/other/path/copilot');
  });
});

describe('validatePrerequisites', () => {
  it('returns ok when binary found via which', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/resolved/copilot\n' as any);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns install guidance when binary is missing', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const result = provider.validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('GitHub Copilot not found');
    expect(result.message).toContain('@github/copilot');
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
  it('resumes a known Copilot session with --resume', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '' });
    expect(args).toEqual(['--resume', 'sid-1']);
  });

  it('starts interactively with the initial prompt via -i', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '', initialPrompt: 'fix the bug' });
    expect(args).toEqual(['-i', 'fix the bug']);
  });

  it('combines extra args with prompt-interactive startup', () => {
    const args = provider.buildArgs({
      cliSessionId: null,
      isResume: false,
      extraArgs: '--agent coding-agent --output-format json',
      initialPrompt: 'fix the bug',
    });
    expect(args).toEqual(['--agent', 'coding-agent', '--output-format', 'json', '-i', 'fix the bug']);
  });
});

describe('settings and config', () => {
  it('reports hook/status tracking as unavailable for now', () => {
    expect(provider.validateSettings()).toEqual({ statusLine: 'missing', hooks: 'missing', hookDetails: {} });
  });

  it('returns parsed provider config', async () => {
    const config = {
      mcpServers: [{ name: 'github', url: 'docker', status: 'configured', scope: 'user' as const, filePath: '/tmp/mcp-config.json' }],
      agents: [],
      skills: [],
      commands: [],
    };
    mockGetCopilotConfig.mockResolvedValueOnce(config);
    await expect(provider.getConfig('/some/path')).resolves.toEqual(config);
    expect(mockGetCopilotConfig).toHaveBeenCalledWith('/some/path');
  });
});

describe('watchers and cleanup', () => {
  it('starts a copilot config watcher', () => {
    const win = { id: 1 } as any;
    provider.startConfigWatcher(win, '/project');
    expect(mockStartConfigWatcher).toHaveBeenCalledWith(win, '/project', 'copilot');
  });

  it('cleanup stops config watching', () => {
    provider.cleanup();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
  });

  it('reinstallSettings remains a safe no-op', () => {
    expect(() => provider.reinstallSettings()).not.toThrow();
  });
});
