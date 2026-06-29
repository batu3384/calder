import * as path from 'path';
import { vi } from 'vitest';

import { isWin } from '../platform';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../full-path', () => ({
  getFullPath: vi.fn(() => (isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin')),
}));

vi.mock('../antigravity-config', () => ({
  getAntigravityConfig: vi.fn(async () => ({
    mcpServers: [],
    agents: [],
    skills: [],
    commands: [],
  })),
}));

vi.mock('../config-watcher', () => ({
  startConfigWatcher: vi.fn(),
  stopConfigWatcher: vi.fn(),
}));

vi.mock('../antigravity-hooks', () => ({
  installAntigravityHooks: vi.fn(),
  validateAntigravityHooks: vi.fn(() => ({
    statusLine: 'calder',
    hooks: 'complete',
    hookDetails: {},
  })),
  cleanupAntigravityHooks: vi.fn(),
  SESSION_ID_VAR: 'CALDER_SESSION_ID',
}));

import { execSync } from 'child_process';
import * as fs from 'fs';

import { resetBinaryProbeMocks } from '../../test-support/reset-binary-probe-mocks';
import { getAntigravityConfig } from '../antigravity-config';
import {
  cleanupAntigravityHooks,
  installAntigravityHooks,
  validateAntigravityHooks,
} from '../antigravity-hooks';
import { startConfigWatcher, stopConfigWatcher } from '../config-watcher';
import { _resetCachedPath, AntigravityProvider } from './antigravity-provider';
import { _resetPrereqCheckCache } from './resolve-binary';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockExecSync = vi.mocked(execSync);
const mockGetAntigravityConfig = vi.mocked(getAntigravityConfig);
const mockStartConfigWatcher = vi.mocked(startConfigWatcher);
const mockStopConfigWatcher = vi.mocked(stopConfigWatcher);
const mockInstallAntigravityHooks = vi.mocked(installAntigravityHooks);
const mockValidateAntigravityHooks = vi.mocked(validateAntigravityHooks);
const mockCleanupAntigravityHooks = vi.mocked(cleanupAntigravityHooks);

let provider: AntigravityProvider;

beforeEach(() => {
  vi.clearAllMocks();
  resetBinaryProbeMocks(mockExistsSync, mockExecSync);
  mockReaddirSync.mockReturnValue([]);
  _resetCachedPath();
  _resetPrereqCheckCache();
  provider = new AntigravityProvider();
});

describe('meta', () => {
  it('has correct id, displayName, and binaryName', () => {
    expect(provider.meta.id).toBe('antigravity');
    expect(provider.meta.displayName).toBe('Antigravity CLI');
    expect(provider.meta.binaryName).toBe('agy');
  });

  it('has sessionResume, hookStatus, and configReading capabilities enabled', () => {
    const caps = provider.meta.capabilities;
    expect(caps.sessionResume).toBe(true);
    expect(caps.costTracking).toBe(true);
    expect(caps.contextWindow).toBe(true);
    expect(caps.hookStatus).toBe(true);
    expect(caps.configReading).toBe(true);
    expect(caps.shiftEnterNewline).toBe(false);
    expect(caps.pendingPromptTrigger).toBe('startup-arg');
    expect(caps.planModeArg).toBeUndefined();
  });

  it('has defaultContextWindowSize of 1,000,000', () => {
    expect(provider.meta.defaultContextWindowSize).toBe(1_000_000);
  });
});

describe('resolveBinaryPath', () => {
  const firstCandidate = isWin
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'agy.cmd')
    : '/usr/local/bin/agy';

  it('returns candidate path when existsSync returns true', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });

  it(`falls back to ${isWin ? 'where' : 'which'} agy when no candidate exists`, () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/some/other/path/agy\n' as any);
    expect(provider.resolveBinaryPath()).toBe('/some/other/path/agy');
  });

  it('falls back to bare "antigravity" when both candidate and which fail', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(provider.resolveBinaryPath()).toBe('antigravity');
  });

  it('caches result on subsequent calls', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    provider.resolveBinaryPath();
    mockExistsSync.mockReturnValue(false);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });
});

describe('validatePrerequisites', () => {
  const validateCandidate = isWin
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'agy.cmd')
    : '/opt/homebrew/bin/agy';

  it('returns ok when binary found via existsSync', () => {
    mockExistsSync.mockImplementation((p) => p === validateCandidate);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns ok when binary found via which', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/resolved/agy\n' as any);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns not ok when binary not found anywhere', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const result = provider.validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Antigravity CLI not found');
    expect(result.message).toContain('brew install --cask antigravity-cli');
  });
});

describe('buildEnv', () => {
  it('sets PATH to the augmented PATH', () => {
    const env = provider.buildEnv('sess-123', {});
    expect(env.PATH).toBe(isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin');
  });

  it('sets CALDER_SESSION_ID to the session ID', () => {
    const env = provider.buildEnv('sess-123', {});
    expect(env.CALDER_SESSION_ID).toBe('sess-123');
    expect(env.CALDER_RUNTIME).toBe('1');
  });

  it('preserves existing env vars', () => {
    const env = provider.buildEnv('sess-123', { ANTIGRAVITY_API_KEY: 'key123', OTHER: 'val' });
    expect(env.ANTIGRAVITY_API_KEY).toBe('key123');
    expect(env.OTHER).toBe('val');
  });
});

describe('buildArgs', () => {
  it('returns ["--conversation", id] when isResume=true with cliSessionId', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '' });
    expect(args).toEqual(['--conversation', 'sid-1']);
  });

  it('returns [] when isResume=false with cliSessionId', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: false, extraArgs: '' });
    expect(args).toEqual([]);
  });

  it('returns [] when cliSessionId is null', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '' });
    expect(args).toEqual([]);
  });

  it('splits extraArgs on whitespace and appends', () => {
    const args = provider.buildArgs({
      cliSessionId: null,
      isResume: false,
      extraArgs: '--model gemini-2.5-flash  --sandbox',
    });
    expect(args).toEqual(['--model', 'gemini-2.5-flash', '--sandbox']);
  });

  it('combines resume args and extra args', () => {
    const args = provider.buildArgs({
      cliSessionId: 'sid-1',
      isResume: true,
      extraArgs: '--model gemini-2.5-flash',
    });
    expect(args).toEqual(['--conversation', 'sid-1', '--model', 'gemini-2.5-flash']);
  });

  it('appends -i flag when initialPrompt is provided', () => {
    const args = provider.buildArgs({
      cliSessionId: null,
      isResume: false,
      extraArgs: '',
      initialPrompt: 'Fix the hooks config',
    });
    expect(args).toEqual(['-i', 'Fix the hooks config']);
  });

  it('does not append -i flag when initialPrompt is absent', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '' });
    expect(args).toEqual([]);
  });
});

describe('getShiftEnterSequence', () => {
  it('returns null', () => {
    expect(provider.getShiftEnterSequence()).toBeNull();
  });
});

describe('hooks integration', () => {
  it('installHooks delegates to installAntigravityHooks', async () => {
    await provider.installHooks();
    expect(mockInstallAntigravityHooks).toHaveBeenCalled();
  });

  it('validateSettings delegates to validateAntigravityHooks', () => {
    const result = provider.validateSettings();
    expect(mockValidateAntigravityHooks).toHaveBeenCalled();
    expect(result).toEqual({ statusLine: 'calder', hooks: 'complete', hookDetails: {} });
  });

  it('cleanup keeps hooks in place and only stops config watching', () => {
    provider.cleanup();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
    expect(mockCleanupAntigravityHooks).not.toHaveBeenCalled();
  });

  it('reinstallSettings cleans up external hooks when injection is disabled', () => {
    provider.reinstallSettings();
    expect(mockCleanupAntigravityHooks).toHaveBeenCalled();
    expect(mockInstallAntigravityHooks).not.toHaveBeenCalled();
  });
});

describe('other methods', () => {
  it('getConfig delegates to antigravity config reader', async () => {
    const config = {
      mcpServers: [
        { name: 'a', url: 'b', status: 'configured', scope: 'user' as const, filePath: '/x' },
      ],
      agents: [],
      skills: [],
      commands: [],
    };
    mockGetAntigravityConfig.mockResolvedValueOnce(config);
    await expect(provider.getConfig('/some/path')).resolves.toEqual(config);
    expect(mockGetAntigravityConfig).toHaveBeenCalledWith('/some/path');
  });

  it('installStatusScripts does not throw', () => {
    expect(() => provider.installStatusScripts()).not.toThrow();
  });

  it('starts an antigravity config watcher', () => {
    const win = { id: 1 } as any;
    provider.startConfigWatcher(win, '/project');
    expect(mockStartConfigWatcher).toHaveBeenCalledWith(win, '/project', 'antigravity');
  });

  it('stops an antigravity config watcher', () => {
    provider.stopConfigWatcher();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
  });
});

describe('getTranscriptPath', () => {
  const tmpRoot = path.join('/mock/home', '.gemini', 'tmp');
  const projectA = path.join(tmpRoot, 'project-a');
  const projectB = path.join(tmpRoot, 'project-b');
  const chatsDir = path.join(projectB, 'chats');

  it('returns null when antigravity tmp root does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(provider.getTranscriptPath('12345678abcdef', '/target/project')).toBeNull();
  });

  it('prefers a file containing the full session id over newer short-id collisions', () => {
    const sessionId = '12345678abcdef';
    const olderMatch = path.join(chatsDir, 'session-1000-12345678.json');
    const newerCollision = path.join(chatsDir, 'session-2000-12345678.json');

    mockExistsSync.mockImplementation((p) => String(p) === tmpRoot || String(p) === chatsDir);
    mockReaddirSync.mockImplementation((dir: any) => {
      const target = String(dir);
      if (target === tmpRoot) return ['project-a', 'project-b'] as any;
      if (target === chatsDir)
        return ['session-1000-12345678.json', 'session-2000-12345678.json'] as any;
      return [] as any;
    });
    mockReadFileSync.mockImplementation((file: any) => {
      const target = String(file);
      if (target === path.join(projectA, '.project_root')) return '/other/project';
      if (target === path.join(projectB, '.project_root')) return '/target/project';
      if (target === olderMatch) return `{"sessionId":"${sessionId}"}`;
      if (target === newerCollision) return '{"sessionId":"someone-else"}';
      throw new Error(`ENOENT: ${target}`);
    });
    mockStatSync.mockImplementation((file: any) => {
      const target = String(file);
      if (target === olderMatch) return { mtimeMs: 1000 } as any;
      if (target === newerCollision) return { mtimeMs: 2000 } as any;
      throw new Error(`ENOENT: ${target}`);
    });

    expect(provider.getTranscriptPath(sessionId, '/target/project')).toBe(olderMatch);
  });

  it('falls back to newest mtime candidate when none include full session id', () => {
    const sessionId = 'abcdef1234567890';
    const older = path.join(chatsDir, 'session-1000-abcdef12.json');
    const newer = path.join(chatsDir, 'session-2000-abcdef12.json');

    mockExistsSync.mockImplementation((p) => String(p) === tmpRoot || String(p) === chatsDir);
    mockReaddirSync.mockImplementation((dir: any) => {
      const target = String(dir);
      if (target === tmpRoot) return ['project-b'] as any;
      if (target === chatsDir)
        return ['session-1000-abcdef12.json', 'session-2000-abcdef12.json'] as any;
      return [] as any;
    });
    mockReadFileSync.mockImplementation((file: any) => {
      const target = String(file);
      if (target === path.join(projectB, '.project_root')) return '/target/project';
      if (target === older) return '{"sessionId":"someone-else"}';
      if (target === newer) throw new Error('unreadable');
      throw new Error(`ENOENT: ${target}`);
    });
    mockStatSync.mockImplementation((file: any) => {
      const target = String(file);
      if (target === older) return { mtimeMs: 1000 } as any;
      if (target === newer) return { mtimeMs: 2000 } as any;
      throw new Error(`ENOENT: ${target}`);
    });

    expect(provider.getTranscriptPath(sessionId, '/target/project')).toBe(newer);
  });

  it('returns null when project is found but chats directory is missing', () => {
    mockExistsSync.mockImplementation((p) => String(p) === tmpRoot);
    mockReaddirSync.mockImplementation((dir: any) => {
      if (String(dir) === tmpRoot) return ['project-b'] as any;
      return [] as any;
    });
    mockReadFileSync.mockImplementation((file: any) => {
      if (String(file) === path.join(projectB, '.project_root')) return '/target/project';
      throw new Error(`ENOENT: ${String(file)}`);
    });

    expect(provider.getTranscriptPath('12345678abcdef', '/target/project')).toBeNull();
  });

  it('returns null when tmp root enumeration throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('permission denied');
    });

    expect(provider.getTranscriptPath('12345678abcdef', '/target/project')).toBeNull();
  });
});
