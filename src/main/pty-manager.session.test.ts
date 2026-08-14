import { vi } from 'vitest';

import { isWin } from './platform';

const {
  mockSanitizeSpawnArgs,
  mockSanitizeInitialPrompt,
  mockSanitizeSessionId,
  mockValidateCwd,
  mockSanitizeExtraArgs,
} = vi.hoisted(() => ({
  mockSanitizeSpawnArgs: vi.fn((args: string[]) => args),
  mockSanitizeInitialPrompt: vi.fn((prompt: string) => ({ ok: true, value: prompt })),
  mockSanitizeSessionId: vi.fn((id: string) => ({ ok: true, value: id })),
  mockValidateCwd: vi.fn((cwd: string) => ({ ok: true, value: cwd })),
  mockSanitizeExtraArgs: vi.fn((args: string) => (args ? args.split(/\s+/) : [])),
}));

const {
  mockSpawn,
  mockWrite,
  mockResize,
  mockKill,
  mockExecFile,
  mockExecFileSync,
  mockExecSync,
  mockSpawnSync,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockWrite: vi.fn(),
  mockResize: vi.fn(),
  mockKill: vi.fn(),
  mockExecFile: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockExecSync: vi.fn(() => {
    throw new Error('not found');
  }),
  mockSpawnSync: vi.fn(() => ({ status: 0 })),
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
  spawnSync: mockSpawnSync,
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
  readdirSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
}));

vi.mock('./browser-bridge', () => ({
  buildBrowserBridgeEnv: mockBuildBrowserBridgeEnv,
}));

vi.mock('./security/sanitize', () => ({
  sanitizeArgs: mockSanitizeSpawnArgs,
  sanitizeSpawnArgs: mockSanitizeSpawnArgs,
  sanitizeInitialPrompt: mockSanitizeInitialPrompt,
  sanitizeSessionId: mockSanitizeSessionId,
  validateCwd: mockValidateCwd,
  sanitizeExtraArgs: mockSanitizeExtraArgs,
}));

import * as fs from 'fs';

import { _resetLoginShellEnvCache } from './provider-env';
import { initProviders } from './providers/registry';
import {
  getPtyCwd,
  killAllPtys,
  killPty,
  resizePty,
  spawnPty,
  spawnShellPty,
  writePty,
} from './pty-manager';

const mockExistsSync = vi.mocked(fs.existsSync);

function createMockPtyProcess() {
  const dataCallbacks: ((data: string) => void)[] = [];
  const exitCallbacks: ((info: { exitCode: number; signal?: number }) => void)[] = [];
  const proc = {
    onData: vi.fn((cb: (data: string) => void) => {
      dataCallbacks.push(cb);
    }),
    onExit: vi.fn((cb: (info: { exitCode: number; signal?: number }) => void) => {
      exitCallbacks.push(cb);
    }),
    write: mockWrite,
    resize: mockResize,
    kill: mockKill,
    _emitData: (data: string) => dataCallbacks.forEach((cb) => cb(data)),
    _emitExit: (exitCode: number, signal?: number) =>
      exitCallbacks.forEach((cb) => cb({ exitCode, signal })),
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

describe('getFullPath', () => {
  it('prefers the login shell PATH when available', async () => {
    if (isWin) return;

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

    const expectedShell = isWin
      ? process.env.COMSPEC || 'cmd.exe'
      : process.env.SHELL || '/bin/zsh';

    expect(mockSpawn).toHaveBeenCalledWith(
      expectedShell,
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
  it('does not notify onExit when a replaced PTY exits late', () => {
    const first = createMockPtyProcess();
    const second = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onExitOld = vi.fn();
    const onExitNew = vi.fn();

    spawnPty('replace-me', '/project', null, false, '', 'claude', undefined, vi.fn(), onExitOld);
    spawnPty('replace-me', '/project', null, false, '', 'claude', undefined, vi.fn(), onExitNew);

    expect(mockKill).toHaveBeenCalledTimes(1);

    first._emitExit(1, 0);
    expect(onExitOld).not.toHaveBeenCalled();
    expect(onExitNew).not.toHaveBeenCalled();

    second._emitExit(0, 0);
    expect(onExitNew).toHaveBeenCalledWith(0, 0);
    expect(onExitOld).not.toHaveBeenCalled();
  });

  it('ignores a late exit after the replacement PTY already exited', () => {
    const first = createMockPtyProcess();
    const second = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onExitOld = vi.fn();
    const onExitNew = vi.fn();

    spawnPty('race-me', '/project', null, false, '', 'claude', undefined, vi.fn(), onExitOld);
    spawnPty('race-me', '/project', null, false, '', 'claude', undefined, vi.fn(), onExitNew);

    second._emitExit(0, 0);
    expect(onExitNew).toHaveBeenCalledWith(0, 0);

    first._emitExit(1, 0);
    expect(onExitOld).not.toHaveBeenCalled();
    expect(onExitNew).toHaveBeenCalledTimes(1);
  });

  it('does not resume-fallback-spawn after a newer PTY replaced the failed resume', () => {
    const resumeProc = createMockPtyProcess();
    const replacementProc = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(resumeProc).mockReturnValueOnce(replacementProc);
    const onExitResume = vi.fn();
    const onExitReplacement = vi.fn();

    spawnPty(
      'resume-race',
      '/project',
      'missing-id',
      true,
      '',
      'claude',
      undefined,
      vi.fn(),
      onExitResume,
    );
    resumeProc._emitData('Error: no conversation found with session ID: missing-id');
    expect(mockKill).toHaveBeenCalledTimes(1);

    // User/app respawns before the failed resume PTY exits.
    spawnPty(
      'resume-race',
      '/project',
      null,
      false,
      '',
      'claude',
      undefined,
      vi.fn(),
      onExitReplacement,
    );
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    resumeProc._emitExit(1, 0);
    // Must NOT spawn a third "fresh" PTY over the replacement.
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(onExitResume).not.toHaveBeenCalled();
    expect(onExitReplacement).not.toHaveBeenCalled();

    replacementProc._emitExit(0, 0);
    expect(onExitReplacement).toHaveBeenCalledWith(0, 0);
  });

  it('drops stale onData from a replaced PTY', () => {
    const first = createMockPtyProcess();
    const second = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const onDataOld = vi.fn();
    const onDataNew = vi.fn();

    spawnPty('data-race', '/project', null, false, '', 'claude', undefined, onDataOld, vi.fn());
    spawnPty('data-race', '/project', null, false, '', 'claude', undefined, onDataNew, vi.fn());

    first._emitData('stale-chunk');
    second._emitData('fresh-chunk');

    expect(onDataOld).not.toHaveBeenCalled();
    expect(onDataNew).toHaveBeenCalledWith('fresh-chunk');
    expect(onDataNew).toHaveBeenCalledTimes(1);
  });

  it('detects missing conversation when the error is split across onData chunks', () => {
    const firstProc = createMockPtyProcess();
    const secondProc = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);
    const onData = vi.fn();
    const onExit = vi.fn();

    spawnPty(
      'chunk-split',
      '/project',
      'missing-conversation',
      true,
      '',
      'claude',
      undefined,
      onData,
      onExit,
    );

    firstProc._emitData('Error: no conversation found');
    expect(mockKill).not.toHaveBeenCalled();
    firstProc._emitData(' with session ID: missing-conversation');
    expect(mockKill).toHaveBeenCalledTimes(1);

    firstProc._emitExit(1, 0);
    expect(onExit).not.toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'claude', [], expect.any(Object));
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

    expect(writePty('s1', 'input')).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith('input');
  });

  it('returns false for unknown session', () => {
    expect(writePty('unknown', 'input')).toBe(false);
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
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        if (args[1] === '1000') callback(null, '2000\n');
        return undefined as never;
      },
    );

    // pgrep for pid 2000 returns no children (error)
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(new Error('no children'), '');
        return undefined as never;
      },
    );

    // lsof for pid 2000
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(null, 'p2000\nfcwd\nn/some/worktree/path\n');
        return undefined as never;
      },
    );

    const result = await getPtyCwd('s1');
    expect(result).toBe('/some/worktree/path');
  });

  it('returns null when lsof fails', async () => {
    const proc = createMockPtyProcess();
    (proc as unknown as { pid: number }).pid = 1000;
    mockSpawn.mockReturnValue(proc);
    spawnPty('s2', '/project', null, false, '', 'claude', undefined, vi.fn(), vi.fn());

    // pgrep returns no children
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(new Error('no children'), '');
        return undefined as never;
      },
    );

    // lsof fails
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(new Error('lsof failed'), '');
        return undefined as never;
      },
    );

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
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(new Error('no children'), '');
        return undefined as never;
      },
    );

    // lsof output missing n<path> entry
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(null, 'p3000\nfcwd\n');
        return undefined as never;
      },
    );

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
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        callback(null, 'abc\n');
        return undefined as never;
      },
    );

    // lsof for original pid
    mockExecFile.mockImplementationOnce(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        callback: (err: Error | null, stdout: string) => void,
      ) => {
        expect(args).toContain('4000');
        callback(null, 'p4000\nfcwd\nn/project/from-parent\n');
        return undefined as never;
      },
    );

    const result = await getPtyCwd('s4');
    expect(result).toBe('/project/from-parent');
  });
});
