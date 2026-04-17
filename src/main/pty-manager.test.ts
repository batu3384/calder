import { vi } from 'vitest';
import * as path from 'path';
import { isWin } from './platform';

const { mockSpawn, mockWrite, mockResize, mockKill, mockExecFile, mockExecFileSync, mockExecSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockWrite: vi.fn(),
  mockResize: vi.fn(),
  mockKill: vi.fn(),
  mockExecFile: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockExecSync: vi.fn(() => { throw new Error('not found'); }),
}));

const { mockBuildBrowserBridgeEnv } = vi.hoisted(() => ({
  mockBuildBrowserBridgeEnv: vi.fn((cwd: string, env: Record<string, string>) => ({
    ...env,
    PATH: `/mock-bridge:${env.PATH ?? ''}`,
    BROWSER: '/mock-bridge/calder-open-url',
    CALDER_BROWSER_BRIDGE_CWD: cwd,
  })),
}));

vi.mock('node-pty', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}));

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  execFile: mockExecFile,
  execFileSync: mockExecFileSync,
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
  readdirSync: vi.fn(() => { throw new Error('ENOENT'); }),
}));

vi.mock('./browser-bridge', () => ({
  buildBrowserBridgeEnv: mockBuildBrowserBridgeEnv,
}));

import * as fs from 'fs';
import {
  spawnPty,
  spawnCommandPty,
  spawnShellPty,
  writePty,
  resizePty,
  killPty,
  killAllPtys,
  isSilencedExit,
  getPtyCwd,
} from './pty-manager';
import { initProviders } from './providers/registry';
import { _resetLoginShellEnvCache } from './provider-env';

const mockExistsSync = vi.mocked(fs.existsSync);

function createMockPtyProcess() {
  const dataCallbacks: ((data: string) => void)[] = [];
  const exitCallbacks: ((info: { exitCode: number; signal?: number }) => void)[] = [];
  const proc = {
    onData: vi.fn((cb: (data: string) => void) => { dataCallbacks.push(cb); }),
    onExit: vi.fn((cb: (info: { exitCode: number; signal?: number }) => void) => { exitCallbacks.push(cb); }),
    write: mockWrite,
    resize: mockResize,
    kill: mockKill,
    _emitData: (data: string) => dataCallbacks.forEach(cb => cb(data)),
    _emitExit: (exitCode: number, signal?: number) => exitCallbacks.forEach(cb => cb({ exitCode, signal })),
  };
  return proc;
}

beforeEach(() => {
  killAllPtys();
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  _resetLoginShellEnvCache();
  initProviders();
});

describe('spawnPty', () => {
  it('spawns a PTY process with correct args', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude', // falls back to bare 'claude'
      [],
      expect.objectContaining({
        cwd: '/project',
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
      }),
    );
  });

  it('adds -r flag when resuming with cliSessionId', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', 'claude-123', true, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['-r', 'claude-123'],
      expect.any(Object),
    );
  });

  it('adds --session-id flag when not resuming', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', 'claude-123', false, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--session-id', 'claude-123'],
      expect.any(Object),
    );
  });

  it('splits extraArgs into individual args', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', null, false, '--verbose --debug', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--verbose', '--debug'],
      expect.any(Object),
    );
  });

  it('forwards PTY data to callback', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    const onData = vi.fn();

    spawnPty('s1', '/project', null, false, '', 'claude', undefined, onData, vi.fn());
    proc._emitData('hello');

    expect(onData).toHaveBeenCalledWith('hello');
  });

  it('forwards exit event to callback', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    const onExit = vi.fn();

    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), onExit);
    proc._emitExit(0, 0);

    expect(onExit).toHaveBeenCalledWith(0, 0);
  });

  it('uses resolved claude path when found', async () => {
    // Must reset modules to clear cachedClaudePath from prior tests
    vi.resetModules();
    const expectedPath = isWin
      ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'claude.cmd')
      : '/usr/local/bin/claude';
    mockExistsSync.mockImplementation((p) => String(p) === expectedPath);
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    const { initProviders: freshInit } = await import('./providers/registry');
    const { spawnPty: freshSpawnPty } = await import('./pty-manager');
    freshInit();
    freshSpawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      expectedPath,
      [],
      expect.any(Object),
    );
  });

  it('sets required env vars', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    const env = mockSpawn.mock.calls[0][2].env;
    expect(env.CLAUDE_IDE_SESSION_ID).toBe('s1');
    expect(env.CLAUDE_CODE).toBeUndefined();
  });

  it('hydrates missing Claude auth env from the login shell', () => {
    mockExecFileSync.mockReturnValue(
      [
        'ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic',
        'ANTHROPIC_AUTH_TOKEN=test-token',
      ].join('\n')
    );
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    const env = mockSpawn.mock.calls[0][2].env;
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.z.ai/api/anthropic');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
  });

  it('augments PATH with extra directories', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    const envPath = mockSpawn.mock.calls[0][2].env.PATH;
    if (isWin) {
      expect(envPath).toContain(path.join('/mock/home', 'AppData', 'Roaming', 'npm'));
    } else {
      expect(envPath).toContain('/usr/local/bin');
      expect(envPath).toContain('/opt/homebrew/bin');
      expect(envPath).toContain('/mock/home/.local/bin');
    }
  });

  it('injects the Calder browser bridge env into provider sessions', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project/app', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockBuildBrowserBridgeEnv).toHaveBeenCalledWith(
      '/project/app',
      expect.objectContaining({
        CLAUDE_IDE_SESSION_ID: 's1',
      }),
    );
    const env = mockSpawn.mock.calls[0][2].env;
    expect(env.PATH).toContain('/mock-bridge:');
    expect(env.BROWSER).toBe('/mock-bridge/calder-open-url');
    expect(env.CALDER_BROWSER_BRIDGE_CWD).toBe('/project/app');
  });
});

describe('spawnCommandPty', () => {
  it('spawns a generic command PTY with explicit launch settings', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnCommandPty(
      'cli-surface:project-1',
      {
        command: 'python',
        args: ['-m', 'textual', 'run', 'app.py'],
        cwd: '/project',
        cols: 132,
        rows: 40,
        envPatch: { NODE_ENV: 'development' },
      },
      vi.fn(),
      vi.fn(),
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      'python',
      ['-m', 'textual', 'run', 'app.py'],
      expect.objectContaining({
        cwd: '/project',
        cols: 132,
        rows: 40,
        env: expect.objectContaining({
          NODE_ENV: 'development',
          BROWSER: '/mock-bridge/calder-open-url',
        }),
      }),
    );
  });

  it('keeps the replacement command runtime active when the old PTY exits late', () => {
    const oldProc = createMockPtyProcess();
    const newProc = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(oldProc).mockReturnValueOnce(newProc);

    spawnCommandPty(
      'cli-surface:project-1',
      {
        command: 'python',
        args: ['-m', 'textual', 'run', 'app.py'],
        cwd: '/project',
      },
      vi.fn(),
      vi.fn(),
    );
    spawnCommandPty(
      'cli-surface:project-1',
      {
        command: 'python',
        args: ['-m', 'textual', 'run', 'app.py'],
        cwd: '/project',
      },
      vi.fn(),
      vi.fn(),
    );

    oldProc._emitExit(1, 0);
    mockWrite.mockClear();
    writePty('cli-surface:project-1', 'still-active');

    expect(mockKill).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith('still-active');
  });
});

describe('getFullPath', () => {
  it('prefers the login shell PATH when available', async () => {
    vi.resetModules();
    (mockExecSync as any).mockImplementation(() => '__PATH__=/custom/bin:/usr/bin\n');

    const { getFullPath: freshGetFullPath } = await import('./pty-manager');
    expect(freshGetFullPath()).toBe('/custom/bin:/usr/bin');
  });
});

describe('spawnShellPty', () => {
  it('spawns a shell surface with the browser bridge env', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    const onData = vi.fn();
    const onExit = vi.fn();

    spawnShellPty('shell-1', '/project', onData, onExit);
    proc._emitData('shell output');
    proc._emitExit(0, 0);

    expect(mockSpawn).toHaveBeenCalledWith(
      isWin ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh'),
      [],
      expect.objectContaining({
        cwd: '/project',
        rows: 15,
        env: expect.objectContaining({
          BROWSER: '/mock-bridge/calder-open-url',
          CALDER_BROWSER_BRIDGE_CWD: '/project',
        }),
      }),
    );
    expect(onData).toHaveBeenCalledWith('shell output');
    expect(onExit).toHaveBeenCalledWith(0, 0);
  });

  it('replaces an existing shell PTY before launching a new one', () => {
    const first = createMockPtyProcess();
    const second = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);

    spawnShellPty('shell-replace', '/project', vi.fn(), vi.fn());
    spawnShellPty('shell-replace', '/project', vi.fn(), vi.fn());

    expect(mockKill).toHaveBeenCalled();
  });
});

describe('session replacement and cleanup', () => {
  it('silences the old exit when respawning the same session id', () => {
    const first = createMockPtyProcess();
    const second = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);

    spawnPty('replace-me', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());
    spawnPty('replace-me', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockKill).toHaveBeenCalledTimes(1);
    expect(isSilencedExit('replace-me')).toBe(true);
    expect(isSilencedExit('replace-me')).toBe(false);
  });

  it('kills every tracked pty with killAllPtys', () => {
    mockKill.mockClear();
    const first = createMockPtyProcess();
    const second = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);

    spawnPty('kill-a', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());
    spawnShellPty('kill-b', '/project', vi.fn(), vi.fn());

    killAllPtys();

    expect(mockKill).toHaveBeenCalledTimes(2);
  });
});

describe('writePty', () => {
  it('writes to existing PTY', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    writePty('s1', 'input');
    expect(mockWrite).toHaveBeenCalledWith('input');
  });

  it('does nothing for unknown session', () => {
    writePty('unknown', 'input');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe('resizePty', () => {
  it('resizes existing PTY', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    resizePty('s1', 200, 50);
    expect(mockResize).toHaveBeenCalledWith(200, 50);
  });
});

describe('killPty', () => {
  it('kills and removes PTY', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    killPty('s1');
    expect(mockKill).toHaveBeenCalled();

    // Writing after kill should be a no-op
    mockWrite.mockClear();
    writePty('s1', 'input');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('terminates descendant processes before the root PTY process on unix', () => {
    if (isWin) return;

    const proc = createMockPtyProcess();
    (proc as unknown as { pid: number }).pid = 4242;
    mockSpawn.mockReturnValue(proc);
    spawnPty('tree-1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    mockExecFileSync.mockImplementation((command: string, args: string[]) => {
      if (command !== 'pgrep') throw new Error('unexpected command');
      const parentPid = args[1];
      if (parentPid === '4242') return '5000\n5001\n' as never;
      if (parentPid === '5000') return '' as never;
      if (parentPid === '5001') return '7000\n' as never;
      if (parentPid === '7000') throw new Error('no children');
      return '' as never;
    });

    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    killPty('tree-1');

    const calls = processKillSpy.mock.calls.map(([pid, signal]) => [pid, signal]);
    expect(calls).toEqual([
      [7000, 'SIGTERM'],
      [5001, 'SIGTERM'],
      [5000, 'SIGTERM'],
      [4242, 'SIGTERM'],
    ]);
    expect(mockKill).toHaveBeenCalled();

    processKillSpy.mockRestore();
  });
});

describe('getPtyCwd', () => {
  it('returns null for unknown session', async () => {
    const result = await getPtyCwd('unknown');
    expect(result).toBeNull();
  });

  it('returns cwd of deepest child process', async () => {
    const proc = createMockPtyProcess();
    (proc as unknown as { pid: number }).pid = 1000;
    mockSpawn.mockReturnValue(proc);
    spawnPty('s1', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    if (isWin) {
      // On Windows, getPtyCwd always returns null (not supported)
      const result = await getPtyCwd('s1');
      expect(result).toBeNull();
      return;
    }

    // pgrep for pid 1000 returns child 2000
    mockExecFile.mockImplementationOnce((_cmd: string, args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      if (args[1] === '1000') callback(null, '2000\n');
      return undefined as never;
    });

    // pgrep for pid 2000 returns no children (error)
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(new Error('no children'), '');
      return undefined as never;
    });

    // lsof for pid 2000
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(null, 'p2000\nfcwd\nn/some/worktree/path\n');
      return undefined as never;
    });

    const result = await getPtyCwd('s1');
    expect(result).toBe('/some/worktree/path');
  });

  it('returns null when lsof fails', async () => {
    const proc = createMockPtyProcess();
    (proc as unknown as { pid: number }).pid = 1000;
    mockSpawn.mockReturnValue(proc);
    spawnPty('s2', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    // pgrep returns no children
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(new Error('no children'), '');
      return undefined as never;
    });

    // lsof fails
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(new Error('lsof failed'), '');
      return undefined as never;
    });

    const result = await getPtyCwd('s2');
    expect(result).toBeNull();
  });

  it('returns null when lsof output does not contain a cwd path row', async () => {
    const proc = createMockPtyProcess();
    (proc as unknown as { pid: number }).pid = 3000;
    mockSpawn.mockReturnValue(proc);
    spawnPty('s3', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    if (isWin) {
      const result = await getPtyCwd('s3');
      expect(result).toBeNull();
      return;
    }

    // No children
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(new Error('no children'), '');
      return undefined as never;
    });

    // lsof output missing n<path> entry
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(null, 'p3000\nfcwd\n');
      return undefined as never;
    });

    const result = await getPtyCwd('s3');
    expect(result).toBeNull();
  });

  it('falls back to parent pid when child list cannot be parsed', async () => {
    const proc = createMockPtyProcess();
    (proc as unknown as { pid: number }).pid = 4000;
    mockSpawn.mockReturnValue(proc);
    spawnPty('s4', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    if (isWin) {
      const result = await getPtyCwd('s4');
      expect(result).toBeNull();
      return;
    }

    // pgrep reports invalid child output -> parseInt NaN path
    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      callback(null, 'abc\n');
      return undefined as never;
    });

    // lsof for original pid
    mockExecFile.mockImplementationOnce((_cmd: string, args: string[], _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
      expect(args).toContain('4000');
      callback(null, 'p4000\nfcwd\nn/project/from-parent\n');
      return undefined as never;
    });

    const result = await getPtyCwd('s4');
    expect(result).toBe('/project/from-parent');
  });
});
