import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const mockWatch = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockDiscoverProjectCheckpoints = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    watch: mockWatch,
  },
}));

vi.mock('./discovery.js', () => ({
  discoverProjectCheckpoints: mockDiscoverProjectCheckpoints,
}));

import {
  startProjectCheckpointWatcher,
  stopProjectCheckpointWatcher,
} from './watcher.js';

const watchCallbacks = new Map<string, () => void>();
const closeFns: Array<ReturnType<typeof vi.fn>> = [];
const n = (value: string) => value.replace(/\\/g, '/');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchCallbacks.clear();
  closeFns.length = 0;

  mockWatch.mockImplementation(((dirPath: string, listener: () => void) => {
    const close = vi.fn();
    closeFns.push(close);
    watchCallbacks.set(n(dirPath), listener);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as any;
  }) as any);
  mockMkdirSync.mockReset();
});

afterEach(() => {
  stopProjectCheckpointWatcher();
  vi.useRealTimers();
});

describe('project checkpoint watcher', () => {
  it('watches the checkpoint directory and emits refreshed data on change', async () => {
    const nextState = {
      checkpoints: [
        {
          id: 'cp-1',
          path: '/repo/.calder/checkpoints/cp-1.json',
          displayName: 'cp-1.json',
          label: 'Updated save',
          createdAt: '2026-04-14T10:00:00.000Z',
          lastUpdated: '2026-04-14T10:00:00.000Z',
          sessionCount: 2,
          changedFileCount: 1,
          restoreSummary: 'Restores 2 sessions',
        },
      ],
      lastUpdated: '2026-04-14T10:00:00.000Z',
    };
    mockDiscoverProjectCheckpoints.mockResolvedValue(nextState);
    const onChange = vi.fn();
    const checkpointDir = path.join('/repo', '.calder', 'checkpoints');

    startProjectCheckpointWatcher('/repo', onChange);
    expect(mockMkdirSync).toHaveBeenCalledWith(checkpointDir, { recursive: true });
    expect(watchCallbacks.has('/repo/.calder/checkpoints')).toBe(true);

    watchCallbacks.get('/repo/.calder/checkpoints')?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectCheckpoints).toHaveBeenCalledWith('/repo');
    expect(onChange).toHaveBeenCalledWith(nextState);
  });

  it('cleans up timers and watchers on stop', async () => {
    mockDiscoverProjectCheckpoints.mockResolvedValue({ checkpoints: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectCheckpointWatcher('/repo', onChange);
    watchCallbacks.get('/repo/.calder/checkpoints')?.();
    stopProjectCheckpointWatcher();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });

  it('does not restart watchers when called again with the same project and handler', () => {
    const onChange = vi.fn();

    startProjectCheckpointWatcher('/repo', onChange);
    startProjectCheckpointWatcher('/repo', onChange);

    expect(mockWatch).toHaveBeenCalledTimes(1);
    expect(closeFns.every((close) => close.mock.calls.length === 0)).toBe(true);
  });

  it('tolerates watch startup failures when the directory is not available yet', () => {
    mockWatch.mockImplementationOnce(() => {
      throw new Error('watch unavailable');
    });

    expect(() => startProjectCheckpointWatcher('/repo', vi.fn())).not.toThrow();
    expect(mockWatch).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid filesystem events into a single refresh', async () => {
    mockDiscoverProjectCheckpoints.mockResolvedValue({ checkpoints: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectCheckpointWatcher('/repo', onChange);
    const callback = watchCallbacks.get('/repo/.calder/checkpoints');
    callback?.();
    callback?.();
    callback?.();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectCheckpoints).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores delayed notify events after watcher state is stopped', async () => {
    mockDiscoverProjectCheckpoints.mockResolvedValue({ checkpoints: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectCheckpointWatcher('/repo', onChange);
    const callback = watchCallbacks.get('/repo/.calder/checkpoints');
    stopProjectCheckpointWatcher();
    callback?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectCheckpoints).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
