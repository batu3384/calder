import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWatch = vi.hoisted(() => vi.fn());
const mockDiscoverProjectWorkflows = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    watch: mockWatch,
  },
}));

vi.mock('./discovery.js', () => ({
  discoverProjectWorkflows: mockDiscoverProjectWorkflows,
}));

import {
  startProjectWorkflowWatcher,
  stopProjectWorkflowWatcher,
} from './watcher.js';

const watchCallbacks = new Map<string, () => void>();
const closeFns: Array<ReturnType<typeof vi.fn>> = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchCallbacks.clear();
  closeFns.length = 0;

  mockWatch.mockImplementation(((dirPath: string, listener: () => void) => {
    const close = vi.fn();
    closeFns.push(close);
    watchCallbacks.set(dirPath, listener);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as any;
  }) as any);
});

afterEach(() => {
  stopProjectWorkflowWatcher();
  vi.useRealTimers();
});

describe('project workflow watcher', () => {
  it('watches the workflow directory and emits refreshed data on change', async () => {
    const nextState = {
      workflows: [
        {
          id: 'workflow:/repo/.calder/workflows/release.md',
          path: '/repo/.calder/workflows/release.md',
          displayName: 'release.md',
          summary: 'Updated workflow',
          lastUpdated: '2026-04-14T10:00:00.000Z',
        },
      ],
      lastUpdated: '2026-04-14T10:00:00.000Z',
    };
    mockDiscoverProjectWorkflows.mockResolvedValue(nextState);
    const onChange = vi.fn();

    startProjectWorkflowWatcher('/repo', onChange);
    expect(watchCallbacks.has('/repo/.calder/workflows')).toBe(true);

    watchCallbacks.get('/repo/.calder/workflows')?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectWorkflows).toHaveBeenCalledWith('/repo');
    expect(onChange).toHaveBeenCalledWith(nextState);
  });

  it('cleans up timers and watchers on stop', async () => {
    mockDiscoverProjectWorkflows.mockResolvedValue({ workflows: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectWorkflowWatcher('/repo', onChange);
    watchCallbacks.get('/repo/.calder/workflows')?.();
    stopProjectWorkflowWatcher();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });

  it('does not restart watchers when called again with the same project and handler', () => {
    const onChange = vi.fn();

    startProjectWorkflowWatcher('/repo', onChange);
    startProjectWorkflowWatcher('/repo', onChange);

    expect(mockWatch).toHaveBeenCalledTimes(1);
    expect(closeFns.every((close) => close.mock.calls.length === 0)).toBe(true);
  });

  it('tolerates watch startup failures when the directory is not available yet', () => {
    mockWatch.mockImplementationOnce(() => {
      throw new Error('watch unavailable');
    });

    expect(() => startProjectWorkflowWatcher('/repo', vi.fn())).not.toThrow();
    expect(mockWatch).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid filesystem events into a single refresh', async () => {
    mockDiscoverProjectWorkflows.mockResolvedValue({ workflows: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectWorkflowWatcher('/repo', onChange);
    const callback = watchCallbacks.get('/repo/.calder/workflows');
    callback?.();
    callback?.();
    callback?.();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectWorkflows).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores delayed notify events after watcher state is stopped', async () => {
    mockDiscoverProjectWorkflows.mockResolvedValue({ workflows: [], lastUpdated: undefined });
    const onChange = vi.fn();

    startProjectWorkflowWatcher('/repo', onChange);
    const callback = watchCallbacks.get('/repo/.calder/workflows');
    stopProjectWorkflowWatcher();
    callback?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectWorkflows).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
