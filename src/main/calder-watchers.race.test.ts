import { beforeEach, describe, expect, it, vi } from 'vitest';

interface WatcherRaceCase {
  name: string;
  watcherModule: string;
  discoveryModule: string;
  discoveryExport: string;
  startExport: string;
  stopExport: string;
}

const RACE_CASES: WatcherRaceCase[] = [
  {
    name: 'tasks',
    watcherModule: './calder-tasks/watcher.js',
    discoveryModule: './calder-tasks/discovery.js',
    discoveryExport: 'discoverProjectBackgroundTasks',
    startExport: 'startProjectBackgroundTaskWatcher',
    stopExport: 'stopProjectBackgroundTaskWatcher',
  },
  {
    name: 'workflows',
    watcherModule: './calder-workflows/watcher.js',
    discoveryModule: './calder-workflows/discovery.js',
    discoveryExport: 'discoverProjectWorkflows',
    startExport: 'startProjectWorkflowWatcher',
    stopExport: 'stopProjectWorkflowWatcher',
  },
  {
    name: 'governance',
    watcherModule: './calder-governance/watcher.js',
    discoveryModule: './calder-governance/discovery.js',
    discoveryExport: 'discoverProjectGovernance',
    startExport: 'startProjectGovernanceWatcher',
    stopExport: 'stopProjectGovernanceWatcher',
  },
  {
    name: 'reviews',
    watcherModule: './calder-reviews/watcher.js',
    discoveryModule: './calder-reviews/discovery.js',
    discoveryExport: 'discoverProjectReviews',
    startExport: 'startProjectReviewWatcher',
    stopExport: 'stopProjectReviewWatcher',
  },
  {
    name: 'checkpoints',
    watcherModule: './calder-checkpoints/watcher.js',
    discoveryModule: './calder-checkpoints/discovery.js',
    discoveryExport: 'discoverProjectCheckpoints',
    startExport: 'startProjectCheckpointWatcher',
    stopExport: 'stopProjectCheckpointWatcher',
  },
];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe('calder watchers race safety', () => {
  for (const testCase of RACE_CASES) {
    it(`ignores in-flight discovery completion after stop for ${testCase.name} watcher`, async () => {
      const watchCallbacks: Array<() => void> = [];
      const closeFns: Array<ReturnType<typeof vi.fn>> = [];
      const mkdirSync = vi.fn();
      const watch = vi.fn(((_dirPath: string, listener: () => void) => {
        watchCallbacks.push(listener);
        const close = vi.fn();
        closeFns.push(close);
        return {
          close,
          on: vi.fn().mockReturnThis(),
        } as any;
      }) as any);

      vi.doMock('node:fs', () => ({
        default: {
          mkdirSync,
          watch,
        },
      }));

      let resolveDiscovery: ((value: unknown) => void) | null = null;
      const discoverySpy = vi.fn(async () => new Promise((resolve) => {
        resolveDiscovery = resolve;
      }));
      vi.doMock(testCase.discoveryModule, () => ({
        [testCase.discoveryExport]: discoverySpy,
      }));

      const watcherModule = await import(testCase.watcherModule) as Record<string, (...args: unknown[]) => unknown>;
      const startWatcher = watcherModule[testCase.startExport] as (projectPath: string, onChange: (state: unknown) => void) => void;
      const stopWatcher = watcherModule[testCase.stopExport] as () => void;

      const seen: unknown[] = [];
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        startWatcher('/repo', (state) => {
          seen.push(state);
        });
        expect(watch).toHaveBeenCalled();
        expect(watchCallbacks.length).toBeGreaterThan(0);

        // Trigger watcher, then let debounce schedule discovery.
        watchCallbacks[0]?.();
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        expect(discoverySpy).toHaveBeenCalledWith('/repo');

        // Stop while discovery promise is still unresolved.
        stopWatcher();
        resolveDiscovery?.({});
        await Promise.resolve();

        expect(seen).toEqual([]);
        expect(unhandled).toEqual([]);
        expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
      } finally {
        process.off('unhandledRejection', onUnhandled);
        stopWatcher();
      }
    });
  }
});

