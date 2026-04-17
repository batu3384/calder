import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

function createMockPtyProcess() {
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  return {
    pid: 1234,
    onData: vi.fn((cb: (data: string) => void) => { dataCallbacks.push(cb); }),
    onExit: vi.fn((cb: (event: { exitCode: number; signal?: number }) => void) => { exitCallbacks.push(cb); }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    _emitData: (data: string) => dataCallbacks.forEach((cb) => cb(data)),
    _emitExit: (exitCode: number, signal?: number) => exitCallbacks.forEach((cb) => cb({ exitCode, signal })),
  };
}

async function loadWindowsPtyManager() {
  vi.resetModules();

  const mockSpawn = vi.fn();
  const mockExecSync = vi.fn();
  const mockExecFile = vi.fn();
  const mockExecFileSync = vi.fn();
  const mockBuildBrowserBridgeEnv = vi.fn((cwd: string, env: Record<string, string>) => ({
    ...env,
    CALDER_BROWSER_BRIDGE_CWD: cwd,
  }));

  vi.doMock('node-pty', () => ({
    default: { spawn: mockSpawn },
    spawn: mockSpawn,
  }));
  vi.doMock('child_process', () => ({
    execSync: mockExecSync,
    execFile: mockExecFile,
    execFileSync: mockExecFileSync,
  }));
  vi.doMock('os', () => ({
    homedir: () => '/mock/home',
  }));
  vi.doMock('./platform', () => ({
    isWin: true,
    pathSep: ';',
    whichCmd: 'where',
  }));
  vi.doMock('./browser-bridge', () => ({
    buildBrowserBridgeEnv: mockBuildBrowserBridgeEnv,
  }));
  vi.doMock('./providers/registry', () => ({
    getProvider: vi.fn(() => ({
      buildEnv: (_sessionId: string, env: Record<string, string>) => env,
      buildArgs: () => [],
      resolveBinaryPath: () => 'claude.exe',
    })),
  }));
  vi.doMock('./hook-status', () => ({
    registerSession: vi.fn(),
  }));
  vi.doMock('./provider-env', () => ({
    buildProviderBaseEnv: (_providerId: string, env: Record<string, string>) => env,
  }));

  const module = await import('./pty-manager');
  return {
    ...module,
    mockSpawn,
    mockBuildBrowserBridgeEnv,
    mockExecSync,
    mockExecFile,
    mockExecFileSync,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pty-manager windows behaviors', () => {
  it('builds full PATH from current PATH plus Windows-specific extras', async () => {
    const { getFullPath } = await loadWindowsPtyManager();
    const originalPath = process.env.PATH;
    const appDataNpm = path.join('/mock/home', 'AppData', 'Roaming', 'npm');
    const localBin = path.join('/mock/home', '.local', 'bin');
    process.env.PATH = `C:\\Windows\\System32;${appDataNpm}`;

    const full = getFullPath();
    const segments = full.split(';');
    expect(segments).toContain(appDataNpm);
    expect(segments).toContain(localBin);
    expect(segments.filter((segment) => segment === appDataNpm)).toHaveLength(1);

    process.env.PATH = originalPath;
  });

  it('spawns shell PTY with COMSPEC when present', async () => {
    const { spawnShellPty, mockSpawn, mockBuildBrowserBridgeEnv, killAllPtys } = await loadWindowsPtyManager();
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    const originalComspec = process.env.COMSPEC;
    process.env.COMSPEC = 'powershell.exe';

    spawnShellPty('shell-win', 'C:\\repo', vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'powershell.exe',
      [],
      expect.objectContaining({
        cwd: 'C:\\repo',
        rows: 15,
      }),
    );
    expect(mockBuildBrowserBridgeEnv).toHaveBeenCalledWith(
      'C:\\repo',
      expect.objectContaining({ PATH: expect.any(String) }),
    );

    killAllPtys();
    process.env.COMSPEC = originalComspec;
  });

  it('falls back to cmd.exe when COMSPEC is unset', async () => {
    const { spawnShellPty, mockSpawn, killAllPtys } = await loadWindowsPtyManager();
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);
    const originalComspec = process.env.COMSPEC;
    delete process.env.COMSPEC;

    spawnShellPty('shell-win-default', 'C:\\repo', vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd.exe',
      [],
      expect.objectContaining({ cwd: 'C:\\repo' }),
    );

    killAllPtys();
    process.env.COMSPEC = originalComspec;
  });

  it('returns null cwd for Windows sessions', async () => {
    const { spawnShellPty, getPtyCwd, mockSpawn, killAllPtys } = await loadWindowsPtyManager();
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnShellPty('shell-win-cwd', 'C:\\repo', vi.fn(), vi.fn());
    await expect(getPtyCwd('shell-win-cwd')).resolves.toBeNull();
    await expect(getPtyCwd('missing')).resolves.toBeNull();

    killAllPtys();
  });
});
