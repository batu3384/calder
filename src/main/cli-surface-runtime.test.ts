import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSpawnCommandPty, mockWritePty, mockResizePty, mockKillPty } = vi.hoisted(() => ({
  mockSpawnCommandPty: vi.fn(),
  mockWritePty: vi.fn(),
  mockResizePty: vi.fn(),
  mockKillPty: vi.fn(),
}));

vi.mock('./pty-manager', () => ({
  spawnCommandPty: mockSpawnCommandPty,
  writePty: mockWritePty,
  resizePty: mockResizePty,
  killPty: mockKillPty,
}));

import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';

describe('cli surface runtime manager', () => {
  const emit = {
    data: vi.fn(),
    exit: vi.fn(),
    status: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('starts one runtime per project using a generic command PTY', () => {
    const manager = createCliSurfaceRuntimeManager(emit);

    manager.start('project-1', {
      id: 'textual',
      name: 'Textual',
      command: 'python',
      args: ['-m', 'textual', 'run', 'app.py'],
      cwd: '/tmp/demo',
      cols: 132,
      rows: 40,
    });

    expect(mockSpawnCommandPty).toHaveBeenCalledWith(
      'cli-surface:project-1',
      expect.objectContaining({
        command: 'python',
        args: ['-m', 'textual', 'run', 'app.py'],
        cwd: '/tmp/demo',
        cols: 132,
        rows: 40,
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'starting',
        runtimeId: 'cli-surface:project-1',
      }),
    );
  });

  it('proxies write, resize, and stop to the active runtime id', () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
    });

    manager.write('project-1', 'j');
    manager.resize('project-1', 160, 48);
    manager.stop('project-1');

    expect(mockWritePty).toHaveBeenCalledWith('cli-surface:project-1', 'j');
    expect(mockResizePty).toHaveBeenCalledWith('cli-surface:project-1', 160, 48);
    expect(mockKillPty).toHaveBeenCalledWith('cli-surface:project-1');
  });

  it('batches bursty PTY data before emitting to the renderer', () => {
    vi.useFakeTimers();
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
    });

    const onData = mockSpawnCommandPty.mock.calls[0][2] as (data: string) => void;
    onData('alpha');
    onData('beta');
    onData('gamma');

    expect(emit.data).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);

    expect(emit.data).toHaveBeenCalledTimes(1);
    expect(emit.data).toHaveBeenCalledWith('project-1', 'alphabetagamma');
  });

  it('marks the runtime as running after the first PTY output', () => {
    vi.useFakeTimers();
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
      cols: 132,
      rows: 40,
    });

    const onData = mockSpawnCommandPty.mock.calls[0][2] as (data: string) => void;
    onData('hello');
    onData(' world');

    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'running',
        runtimeId: 'cli-surface:project-1',
        selectedProfileId: 'bubbletea',
        command: 'go',
        args: ['run', './cmd/app'],
        cwd: '/tmp/demo',
        cols: 132,
        rows: 40,
      }),
    );
    expect(emit.status.mock.calls.filter(([, state]) => state.status === 'running')).toHaveLength(1);
  });

  it('emits startup timing diagnostics across spawn, first output, and stop', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000));
    mockSpawnCommandPty.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(1_045));
    });
    const manager = createCliSurfaceRuntimeManager(emit);

    manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
    });

    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'starting',
        startupTiming: expect.objectContaining({
          startedAtMs: 1_000,
          ptySpawnedAtMs: 1_045,
          spawnLatencyMs: 45,
        }),
      }),
    );

    const onData = mockSpawnCommandPty.mock.calls[0][2] as (data: string) => void;
    vi.setSystemTime(new Date(4_400));
    onData('ready');

    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'running',
        startupTiming: expect.objectContaining({
          firstOutputAtMs: 4_400,
          firstOutputLatencyMs: 3_400,
          runningAtMs: 4_400,
        }),
      }),
    );

    vi.setSystemTime(new Date(6_250));
    manager.stop('project-1');

    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'stopped',
        startupTiming: expect.objectContaining({
          stoppedAtMs: 6_250,
          totalRuntimeMs: 5_250,
        }),
      }),
    );
  });

  it('resolves the built-in CLI surface demo profile into an Electron-as-Node launch', () => {
    const manager = createCliSurfaceRuntimeManager(emit);

    manager.start('project-1', {
      id: 'builtin:cli-surface-demo',
      name: 'Calder CLI Surface Demo',
      command: '__calder_cli_surface_demo__',
      cwd: '/tmp/demo',
    });

    expect(mockSpawnCommandPty).toHaveBeenCalledWith(
      'cli-surface:project-1',
      expect.objectContaining({
        command: process.execPath,
        cwd: '/tmp/demo',
        envPatch: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1',
        }),
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(mockSpawnCommandPty.mock.calls[0]?.[1]?.args?.[0]).toContain('fixtures/cli-surface-demo.js');
  });

  it('flushes pending output and emits stopped state details when runtime exits', () => {
    vi.useFakeTimers();
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
    });

    const onData = mockSpawnCommandPty.mock.calls[0][2] as (data: string) => void;
    const onExit = mockSpawnCommandPty.mock.calls[0][3] as (exitCode: number, signal?: number) => void;

    onData('pending');
    expect(emit.data).not.toHaveBeenCalled();

    onExit(17, 9);

    expect(emit.data).toHaveBeenCalledWith('project-1', 'pending');
    expect(emit.exit).toHaveBeenCalledWith('project-1', 17, 9);
    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'stopped',
        runtimeId: undefined,
        lastExitCode: 17,
      }),
    );
  });

  it('reports restart errors when no profile has been started', () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.restart('project-1');
    expect(emit.error).toHaveBeenCalledWith('project-1', 'No CLI surface profile is selected.');
  });

  it('restarts active runtimes by stopping and spawning again', () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
    });
    expect(mockSpawnCommandPty).toHaveBeenCalledTimes(1);

    manager.restart('project-1');

    expect(mockKillPty).toHaveBeenCalledWith('cli-surface:project-1');
    expect(mockSpawnCommandPty).toHaveBeenCalledTimes(2);
    expect(emit.status.mock.calls.filter(([, state]) => state.status === 'starting').length).toBeGreaterThanOrEqual(2);
  });
});
