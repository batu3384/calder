import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliSurfaceProfile } from '../shared/types/project-surface';

const {
  mockSpawnCommandPty,
  mockWritePty,
  mockResizePty,
  mockKillPty,
  mockResolveCliSurfaceLaunch,
} = vi.hoisted(() => ({
  mockSpawnCommandPty: vi.fn(),
  mockWritePty: vi.fn(),
  mockResizePty: vi.fn(),
  mockKillPty: vi.fn(),
  mockResolveCliSurfaceLaunch: vi.fn(),
}));

vi.mock('./pty-manager', () => ({
  spawnCommandPty: mockSpawnCommandPty,
  writePty: mockWritePty,
  resizePty: mockResizePty,
  killPty: mockKillPty,
}));

vi.mock('./cli-surface-port-orchestrator', () => ({
  resolveCliSurfaceLaunch: mockResolveCliSurfaceLaunch,
}));

import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';

function mockResolvedLaunch(profile: CliSurfaceProfile, overrides?: {
  portMode?: 'auto' | 'fixed' | 'off';
  resolvedPort?: number;
  resolvedUrl?: string;
  portFallbackUsed?: boolean;
  portReason?: string;
}) {
  const cwd = profile.cwd ?? process.cwd();
  return {
    launch: {
      command: profile.command,
      args: profile.args ? [...profile.args] : undefined,
      cwd,
      envPatch: profile.envPatch ? { ...profile.envPatch } : undefined,
      cols: profile.cols,
      rows: profile.rows,
    },
    metadata: {
      portMode: overrides?.portMode ?? (profile.portMode ?? 'auto'),
      resolvedPort: overrides?.resolvedPort,
      resolvedUrl: overrides?.resolvedUrl,
      portFallbackUsed: overrides?.portFallbackUsed,
      portReason: overrides?.portReason ?? 'mock launch resolution',
    },
  };
}

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
    mockResolveCliSurfaceLaunch.mockImplementation(async (_projectId: string, profile: CliSurfaceProfile) => {
      return mockResolvedLaunch(profile, {
        resolvedPort: 5173,
        resolvedUrl: 'http://localhost:5173/',
      });
    });
  });

  it('starts one runtime per project using a generic command PTY', async () => {
    const manager = createCliSurfaceRuntimeManager(emit);

    await manager.start('project-1', {
      id: 'textual',
      name: 'Textual',
      command: 'python',
      args: ['-m', 'textual', 'run', 'app.py'],
      cwd: '/tmp/demo',
      cols: 132,
      rows: 40,
    });

    expect(mockResolveCliSurfaceLaunch).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        command: 'python',
      }),
      expect.any(Set),
    );
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

  it('proxies write, resize, and stop to the active runtime id', async () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    await manager.start('project-1', {
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

  it('marks runtimes without an explicit ready pattern as running after PTY spawn', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2_000));
    mockSpawnCommandPty.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(2_025));
    });
    const manager = createCliSurfaceRuntimeManager(emit);

    await manager.start('project-1', {
      id: 'silent',
      name: 'Silent CLI',
      command: 'node',
      args: ['server.js'],
      cwd: '/tmp/demo',
    });

    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'running',
        startupTiming: expect.objectContaining({
          ptySpawnedAtMs: 2_025,
          runningAtMs: 2_025,
        }),
      }),
    );
  });

  it('batches bursty PTY data before emitting to the renderer', async () => {
    vi.useFakeTimers();
    const manager = createCliSurfaceRuntimeManager(emit);
    await manager.start('project-1', {
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

  it('marks the runtime as running after the first PTY output', async () => {
    vi.useFakeTimers();
    const manager = createCliSurfaceRuntimeManager(emit);
    await manager.start('project-1', {
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
        resolvedPort: 5173,
        resolvedUrl: 'http://localhost:5173/',
      }),
    );
    expect(emit.status.mock.calls.filter(([, state]) => state.status === 'running')).toHaveLength(1);
  });

  it('emits startup timing diagnostics across spawn, first output, and stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000));
    mockSpawnCommandPty.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(1_045));
    });
    const manager = createCliSurfaceRuntimeManager(emit);

    await manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
      startupReadyPattern: 'ready',
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
    expect(emit.status.mock.calls.some(([, state]) => state.status === 'running')).toBe(false);

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

  it('flushes pending output and emits stopped state details when runtime exits', async () => {
    vi.useFakeTimers();
    const manager = createCliSurfaceRuntimeManager(emit);
    await manager.start('project-1', {
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

  it('reports restart errors when no profile has been started', async () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    await manager.restart('project-1');
    expect(emit.error).toHaveBeenCalledWith('project-1', 'No CLI surface profile is selected.');
  });

  it('restarts active runtimes by stopping and spawning again', async () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    await manager.start('project-1', {
      id: 'bubbletea',
      name: 'Bubble Tea',
      command: 'go',
      args: ['run', './cmd/app'],
      cwd: '/tmp/demo',
    });
    expect(mockSpawnCommandPty).toHaveBeenCalledTimes(1);

    await manager.restart('project-1');

    expect(mockKillPty).toHaveBeenCalledWith('cli-surface:project-1');
    expect(mockSpawnCommandPty).toHaveBeenCalledTimes(2);
    expect(
      emit.status.mock.calls.filter(([, state]) => state.status === 'starting').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('emits error status when launch orchestration fails before spawn', async () => {
    mockResolveCliSurfaceLaunch.mockRejectedValueOnce(new Error('Port 5173 is already in use and fallback is disabled.'));
    const manager = createCliSurfaceRuntimeManager(emit);

    await manager.start('project-1', {
      id: 'broken',
      name: 'Broken',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: '/tmp/demo',
      portMode: 'fixed',
      preferredPort: 5173,
      allowPortFallback: false,
    });

    expect(mockSpawnCommandPty).not.toHaveBeenCalled();
    expect(emit.error).toHaveBeenCalledWith('project-1', 'Port 5173 is already in use and fallback is disabled.');
    expect(emit.status).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'error',
        runtimeId: 'cli-surface:project-1',
        lastError: 'Port 5173 is already in use and fallback is disabled.',
      }),
    );
  });
});
