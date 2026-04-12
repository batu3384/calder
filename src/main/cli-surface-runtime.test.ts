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
});
