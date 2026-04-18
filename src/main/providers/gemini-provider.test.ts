import { vi } from 'vitest';
import * as path from 'path';
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

vi.mock('../pty-manager', () => ({
  getFullPath: vi.fn(() => isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin'),
}));

vi.mock('../gemini-config', () => ({
  getGeminiConfig: vi.fn(async () => ({ mcpServers: [], agents: [], skills: [], commands: [] })),
}));

vi.mock('../config-watcher', () => ({
  startConfigWatcher: vi.fn(),
  stopConfigWatcher: vi.fn(),
}));

vi.mock('../gemini-hooks', () => ({
  installGeminiHooks: vi.fn(),
  validateGeminiHooks: vi.fn(() => ({ statusLine: 'calder', hooks: 'complete', hookDetails: {} })),
  cleanupGeminiHooks: vi.fn(),
  SESSION_ID_VAR: 'CALDER_SESSION_ID',
}));

import * as fs from 'fs';
import { execSync } from 'child_process';
import { GeminiProvider, _resetCachedPath } from './gemini-provider';
import { _resetPrereqCheckCache } from './resolve-binary';
import { getGeminiConfig } from '../gemini-config';
import { startConfigWatcher, stopConfigWatcher } from '../config-watcher';
import { installGeminiHooks, validateGeminiHooks, cleanupGeminiHooks } from '../gemini-hooks';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockExecSync = vi.mocked(execSync);
const mockGetGeminiConfig = vi.mocked(getGeminiConfig);
const mockStartConfigWatcher = vi.mocked(startConfigWatcher);
const mockStopConfigWatcher = vi.mocked(stopConfigWatcher);
const mockInstallGeminiHooks = vi.mocked(installGeminiHooks);
const mockValidateGeminiHooks = vi.mocked(validateGeminiHooks);
const mockCleanupGeminiHooks = vi.mocked(cleanupGeminiHooks);

let provider: GeminiProvider;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCachedPath();
  _resetPrereqCheckCache();
  provider = new GeminiProvider();
});

describe('meta', () => {
  it('has correct id, displayName, and binaryName', () => {
    expect(provider.meta.id).toBe('gemini');
    expect(provider.meta.displayName).toBe('Gemini CLI');
    expect(provider.meta.binaryName).toBe('gemini');
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
    expect(caps.planModeArg).toBe('--approval-mode=plan');
  });

  it('has defaultContextWindowSize of 1,000,000', () => {
    expect(provider.meta.defaultContextWindowSize).toBe(1_000_000);
  });
});

describe('resolveBinaryPath', () => {
  const firstCandidate = isWin
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'gemini.cmd')
    : '/usr/local/bin/gemini';

  it('returns candidate path when existsSync returns true', () => {
    mockExistsSync.mockImplementation((p) => p === firstCandidate);
    expect(provider.resolveBinaryPath()).toBe(firstCandidate);
  });

  it(`falls back to ${isWin ? 'where' : 'which'} gemini when no candidate exists`, () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/some/other/path/gemini\n' as any);
    expect(provider.resolveBinaryPath()).toBe('/some/other/path/gemini');
  });

  it('falls back to bare "gemini" when both candidate and which fail', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(provider.resolveBinaryPath()).toBe('gemini');
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
    ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'gemini.cmd')
    : '/opt/homebrew/bin/gemini';

  it('returns ok when binary found via existsSync', () => {
    mockExistsSync.mockImplementation((p) => p === validateCandidate);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns ok when binary found via which', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('/resolved/gemini\n' as any);
    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });

  it('returns not ok when binary not found anywhere', () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    const result = provider.validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Gemini CLI not found');
    expect(result.message).toContain('@google/gemini-cli');
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
  });

  it('preserves existing env vars', () => {
    const env = provider.buildEnv('sess-123', { GEMINI_API_KEY: 'key123', OTHER: 'val' });
    expect(env.GEMINI_API_KEY).toBe('key123');
    expect(env.OTHER).toBe('val');
  });
});

describe('buildArgs', () => {
  it('returns ["-r", id] when isResume=true with cliSessionId', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '' });
    expect(args).toEqual(['-r', 'sid-1']);
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
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '--model gemini-2.5-flash  --sandbox' });
    expect(args).toEqual(['--model', 'gemini-2.5-flash', '--sandbox']);
  });

  it('combines resume args and extra args', () => {
    const args = provider.buildArgs({ cliSessionId: 'sid-1', isResume: true, extraArgs: '--model gemini-2.5-flash' });
    expect(args).toEqual(['-r', 'sid-1', '--model', 'gemini-2.5-flash']);
  });

  it('appends -i flag when initialPrompt is provided', () => {
    const args = provider.buildArgs({ cliSessionId: null, isResume: false, extraArgs: '', initialPrompt: 'Fix the hooks config' });
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
  it('installHooks delegates to installGeminiHooks', async () => {
    await provider.installHooks();
    expect(mockInstallGeminiHooks).toHaveBeenCalled();
  });

  it('validateSettings delegates to validateGeminiHooks', () => {
    const result = provider.validateSettings();
    expect(mockValidateGeminiHooks).toHaveBeenCalled();
    expect(result).toEqual({ statusLine: 'calder', hooks: 'complete', hookDetails: {} });
  });

  it('cleanup calls cleanupGeminiHooks and stopConfigWatcher', () => {
    provider.cleanup();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
    expect(mockCleanupGeminiHooks).toHaveBeenCalled();
  });

  it('reinstallSettings delegates to installGeminiHooks', () => {
    provider.reinstallSettings();
    expect(mockInstallGeminiHooks).toHaveBeenCalled();
  });
});

describe('other methods', () => {
  it('getConfig delegates to gemini config reader', async () => {
    const config = { mcpServers: [{ name: 'a', url: 'b', status: 'configured', scope: 'user' as const, filePath: '/x' }], agents: [], skills: [], commands: [] };
    mockGetGeminiConfig.mockResolvedValueOnce(config);
    await expect(provider.getConfig('/some/path')).resolves.toEqual(config);
    expect(mockGetGeminiConfig).toHaveBeenCalledWith('/some/path');
  });

  it('installStatusScripts does not throw', () => {
    expect(() => provider.installStatusScripts()).not.toThrow();
  });

  it('starts a gemini config watcher', () => {
    const win = { id: 1 } as any;
    provider.startConfigWatcher(win, '/project');
    expect(mockStartConfigWatcher).toHaveBeenCalledWith(win, '/project', 'gemini');
  });

  it('stops gemini config watcher', () => {
    provider.stopConfigWatcher();
    expect(mockStopConfigWatcher).toHaveBeenCalled();
  });
});

describe('getTranscriptPath', () => {
  const tmpRoot = path.join('/mock/home', '.gemini', 'tmp');
  const projectA = path.join(tmpRoot, 'project-a');
  const projectB = path.join(tmpRoot, 'project-b');
  const chatsDir = path.join(projectB, 'chats');

  it('returns null when gemini tmp root does not exist', () => {
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
      if (target === chatsDir) return ['session-1000-12345678.json', 'session-2000-12345678.json'] as any;
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
      if (target === chatsDir) return ['session-1000-abcdef12.json', 'session-2000-abcdef12.json'] as any;
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
