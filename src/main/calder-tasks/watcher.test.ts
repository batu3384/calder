import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const mockWatch = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockDiscoverProjectBackgroundTasks = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    watch: mockWatch,
  },
}));

vi.mock('./discovery.js', () => ({
  discoverProjectBackgroundTasks: mockDiscoverProjectBackgroundTasks,
}));

import {
  startProjectBackgroundTaskWatcher,
  stopProjectBackgroundTaskWatcher,
} from './watcher.js';

const watchCallbacks = new Map<string, () => void>();
const closeFns: Array<ReturnType<typeof vi.fn>> = [];
const n = (value: string) => value.replace(/\\/g, '/');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchCallbacks.clear();
  closeFns.length = 0;
  mockMkdirSync.mockReset();

  mockWatch.mockImplementation(((dirPath: string, listener: () => void) => {
    const close = vi.fn();
    closeFns.push(close);
    watchCallbacks.set(n(dirPath), listener);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as any;
  }) as any);
});

afterEach(() => {
  stopProjectBackgroundTaskWatcher();
  vi.useRealTimers();
});

describe('project background task watcher', () => {
  it('watches the task directory and emits refreshed data on change', async () => {
    const nextState = {
      tasks: [
        {
          id: 'task:/repo/.calder/tasks/task-1.json',
          path: '/repo/.calder/tasks/task-1.json',
          title: 'Ship report',
          status: 'running',
          summary: 'Updated pass',
          createdAt: '2026-04-14T10:00:00.000Z',
          lastUpdated: '2026-04-14T10:00:00.000Z',
          artifactCount: 1,
          handoffSummary: '',
        },
      ],
      queuedCount: 0,
      runningCount: 1,
      completedCount: 0,
      lastUpdated: '2026-04-14T10:00:00.000Z',
    };
    mockDiscoverProjectBackgroundTasks.mockResolvedValue(nextState);
    const onChange = vi.fn();
    const tasksDir = path.join('/repo', '.calder', 'tasks');

    startProjectBackgroundTaskWatcher('/repo', onChange);
    expect(mockMkdirSync).toHaveBeenCalledWith(tasksDir, { recursive: true });
    expect(watchCallbacks.has('/repo/.calder/tasks')).toBe(true);

    watchCallbacks.get('/repo/.calder/tasks')?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectBackgroundTasks).toHaveBeenCalledWith('/repo');
    expect(onChange).toHaveBeenCalledWith(nextState);
  });

  it('cleans up timers and watchers on stop', async () => {
    mockDiscoverProjectBackgroundTasks.mockResolvedValue({
      tasks: [],
      queuedCount: 0,
      runningCount: 0,
      completedCount: 0,
      lastUpdated: undefined,
    });
    const onChange = vi.fn();

    startProjectBackgroundTaskWatcher('/repo', onChange);
    watchCallbacks.get('/repo/.calder/tasks')?.();
    stopProjectBackgroundTaskWatcher();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });
});
