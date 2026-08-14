import * as path from 'path';
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
import { killAllPtys, spawnPty } from './pty-manager';

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
        env: expect.objectContaining({
          FORCE_COLOR: '1',
          COLORTERM: 'truecolor',
          TERM: 'xterm-256color',
        }),
      }),
    );
    const env = mockSpawn.mock.calls[0][2].env as Record<string, string>;
    expect(env.NO_COLOR).toBeUndefined();
  });

  it('adds -r flag when resuming with cliSessionId', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('s1', '/project', 'claude-123', true, '', 'claude', undefined, vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith('claude', ['-r', 'claude-123'], expect.any(Object));
  });

  it('falls back to a fresh spawn when restored conversation is missing', () => {
    const firstProc = createMockPtyProcess();
    const secondProc = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);
    const onData = vi.fn();
    const onExit = vi.fn();

    spawnPty(
      's1',
      '/project',
      'missing-conversation',
      true,
      '',
      'claude',
      undefined,
      onData,
      onExit,
    );

    expect(mockSpawn).toHaveBeenNthCalledWith(
      1,
      'claude',
      ['-r', 'missing-conversation'],
      expect.any(Object),
    );

    firstProc._emitData('Error: no conversation found with session ID: missing-conversation');
    expect(onData).toHaveBeenCalledWith(
      'Error: no conversation found with session ID: missing-conversation',
    );
    expect(onData).toHaveBeenCalledWith(
      '\r\n[Calder] Previous session could not be resumed. Starting a fresh session...\r\n',
    );
    expect(mockKill).toHaveBeenCalledTimes(1);

    // The first failed resume should not surface an exit to the renderer.
    firstProc._emitExit(1, 0);
    expect(onExit).not.toHaveBeenCalled();

    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'claude', [], expect.any(Object));

    secondProc._emitExit(0, 0);
    expect(onExit).toHaveBeenCalledWith(0, 0);
  });

  it('falls back when Claude Code splits the missing conversation message across lines', () => {
    const firstProc = createMockPtyProcess();
    const secondProc = createMockPtyProcess();
    mockSpawn.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);
    const onData = vi.fn();
    const onExit = vi.fn();

    spawnPty(
      's1',
      '/project',
      '01fd5576-db97-4939-b722-41c11acb22da',
      true,
      '',
      'claude',
      undefined,
      onData,
      onExit,
    );

    firstProc._emitData(
      'No conversation found with\n session ID: 01fd5576-db97\n-4939-b722-41c11acb22da',
    );
    expect(onData).toHaveBeenCalledWith(
      'No conversation found with\n session ID: 01fd5576-db97\n-4939-b722-41c11acb22da',
    );
    expect(onData).toHaveBeenCalledWith(
      '\r\n[Calder] Previous session could not be resumed. Starting a fresh session...\r\n',
    );
    expect(mockKill).toHaveBeenCalledTimes(1);

    firstProc._emitExit(1, 0);
    expect(onExit).not.toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'claude', [], expect.any(Object));
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

    spawnPty(
      's1',
      '/project',
      null,
      false,
      '--verbose --debug',
      'claude',
      undefined,
      vi.fn(),
      vi.fn(),
    );

    expect(mockSpawn).toHaveBeenCalledWith('claude', ['--verbose', '--debug'], expect.any(Object));
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

    expect(mockSpawn).toHaveBeenCalledWith(expectedPath, [], expect.any(Object));
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
    if (isWin) return;

    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    mockExecFileSync.mockReturnValue(
      ['ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic', 'ANTHROPIC_AUTH_TOKEN=test-token'].join(
        '\n',
      ),
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
