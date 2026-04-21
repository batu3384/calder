import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockDiscoverCliSurface = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
}));

vi.mock('./cli-surface-discovery', () => ({
  discoverCliSurface: mockDiscoverCliSurface,
}));

import { registerCliSurfaceIpcHandlers } from './ipc-cli-surface';
import type { CliSurfaceIpcPolicy } from './ipc-cli-surface';

const baseProfile = {
  id: 'dev',
  name: 'Dev server',
  command: 'npm',
  args: ['run', 'dev'],
  cwd: '/repo',
  portMode: 'fixed' as const,
  preferredPort: 5173,
  allowPortFallback: false,
};

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function getOnHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.on registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function createPolicy(projectPath = '/repo'): CliSurfaceIpcPolicy {
  return {
    resolveProjectPath: vi.fn((projectId: string) => (projectId === 'project-1' ? projectPath : undefined)),
    isWithinKnownProject: vi.fn((resolvedPath: string) => {
      return resolvedPath === projectPath || resolvedPath.startsWith(`${projectPath}/`);
    }),
  };
}

describe('ipc cli-surface handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes start/stop/restart/write/resize calls to the runtime', async () => {
    const runtime = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      restart: vi.fn(async () => {}),
      write: vi.fn(),
      resize: vi.fn(),
    };
    mockDiscoverCliSurface.mockResolvedValue({ profiles: [] });

    registerCliSurfaceIpcHandlers(runtime, createPolicy());

    const startHandler = getHandleHandler('cli-surface:start');
    const stopHandler = getHandleHandler('cli-surface:stop');
    const restartHandler = getHandleHandler('cli-surface:restart');
    const writeHandler = getOnHandler('cli-surface:write');
    const resizeHandler = getOnHandler('cli-surface:resize');

    await startHandler({}, 'project-1', baseProfile);
    stopHandler({}, 'project-1');
    await restartHandler({}, 'project-1');
    writeHandler({}, 'project-1', 'npm run dev\n');
    resizeHandler({}, 'project-1', 140, 42);

    expect(runtime.start).toHaveBeenCalledWith('project-1', expect.objectContaining(baseProfile));
    expect(runtime.stop).toHaveBeenCalledWith('project-1');
    expect(runtime.restart).toHaveBeenCalledWith('project-1');
    expect(runtime.write).toHaveBeenCalledWith('project-1', 'npm run dev\n');
    expect(runtime.resize).toHaveBeenCalledWith('project-1', 140, 42);
  });

  it('delegates discover requests to discoverCliSurface', async () => {
    const runtime = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      restart: vi.fn(async () => {}),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const discoverResult = { profiles: [{ id: 'local', displayName: 'Local' }] };
    mockDiscoverCliSurface.mockResolvedValue(discoverResult);

    registerCliSurfaceIpcHandlers(runtime, createPolicy());

    const discoverHandler = getHandleHandler('cli-surface:discover');
    const result = await discoverHandler({}, '/repo');

    expect(mockDiscoverCliSurface).toHaveBeenCalledWith('/repo');
    expect(result).toEqual(discoverResult);
  });

  it('rejects start requests for unknown projects or cwd escape attempts', async () => {
    const runtime = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      restart: vi.fn(async () => {}),
      write: vi.fn(),
      resize: vi.fn(),
    };

    registerCliSurfaceIpcHandlers(runtime, createPolicy());
    const startHandler = getHandleHandler('cli-surface:start');

    await expect(startHandler({}, 'missing-project', baseProfile)).rejects.toThrow(/known project/i);
    await expect(
      startHandler({}, 'project-1', {
        ...baseProfile,
        cwd: '/tmp/outside',
      }),
    ).rejects.toThrow(/known project/i);
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('ignores oversized write payloads on fire-and-forget channels', () => {
    const runtime = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      restart: vi.fn(async () => {}),
      write: vi.fn(),
      resize: vi.fn(),
    };

    registerCliSurfaceIpcHandlers(runtime, createPolicy());
    const writeHandler = getOnHandler('cli-surface:write');

    writeHandler({}, 'project-1', 'x'.repeat(256 * 1024 + 1));
    writeHandler({}, 'missing-project', 'npm run dev\n');

    expect(runtime.write).not.toHaveBeenCalled();
  });
});
