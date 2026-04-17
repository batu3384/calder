import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const mockWatch = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockDiscoverProjectTeamContext = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    watch: mockWatch,
    mkdirSync: mockMkdirSync,
  },
}));

vi.mock('./discovery.js', () => ({
  discoverProjectTeamContext: mockDiscoverProjectTeamContext,
}));

import { startProjectTeamContextWatcher } from './watcher.js';

const watchCallbacks = new Map<string, () => void>();
const closeFns: Array<ReturnType<typeof vi.fn>> = [];
const n = (value: string) => value.replace(/\\/g, '/');
const teamDir = path.join('/repo', '.calder', 'team');
const rulesDir = path.join('/repo', '.calder', 'rules');
const workflowsDir = path.join('/repo', '.calder', 'workflows');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchCallbacks.clear();
  closeFns.length = 0;

  mockWatch.mockImplementation(((
    dirPath: string,
    optionsOrListener: { recursive: boolean } | (() => void),
    maybeListener?: () => void,
  ) => {
    const listener = typeof optionsOrListener === 'function'
      ? optionsOrListener
      : maybeListener;
    if (!listener) {
      throw new Error('listener is required');
    }
    const close = vi.fn();
    closeFns.push(close);
    watchCallbacks.set(n(dirPath), listener);
    return { close } as any;
  }) as any);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('project team context watcher', () => {
  it('watches shared team directories and emits refreshed state on change', async () => {
    const nextState = {
      spaces: [
        {
          id: 'team-context:/repo/.calder/team/spaces/backend.md',
          path: '/repo/.calder/team/spaces/backend.md',
          displayName: 'backend.md',
          summary: 'Updated guild',
          lastUpdated: '2026-04-14T10:00:00.000Z',
          linkedRuleCount: 1,
          linkedWorkflowCount: 1,
        },
      ],
      sharedRuleCount: 1,
      workflowCount: 1,
      lastUpdated: '2026-04-14T10:00:00.000Z',
    };
    mockDiscoverProjectTeamContext.mockResolvedValue(nextState);
    const onChange = vi.fn();

    startProjectTeamContextWatcher('/repo', onChange);

    expect(mockMkdirSync).toHaveBeenCalledTimes(3);
    expect(mockWatch).toHaveBeenCalledTimes(3);
    expect(watchCallbacks.has(n(teamDir))).toBe(true);
    expect(watchCallbacks.has(n(rulesDir))).toBe(true);
    expect(watchCallbacks.has(n(workflowsDir))).toBe(true);

    watchCallbacks.get(n(teamDir))?.();
    vi.advanceTimersByTime(80);
    await Promise.resolve();

    expect(mockDiscoverProjectTeamContext).toHaveBeenCalledWith('/repo');
    expect(onChange).toHaveBeenCalledWith(nextState);
  });

  it('cleans up timers and watchers when the returned disposer is called', async () => {
    mockDiscoverProjectTeamContext.mockResolvedValue({
      spaces: [],
      sharedRuleCount: 0,
      workflowCount: 0,
      lastUpdated: undefined,
    });
    const onChange = vi.fn();

    const cleanup = startProjectTeamContextWatcher('/repo', onChange);
    watchCallbacks.get(n(teamDir))?.();
    cleanup();

    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });

  it('ignores in-flight discovery results after disposer is called', async () => {
    let resolveDiscovery: ((value: unknown) => void) | null = null;
    mockDiscoverProjectTeamContext.mockImplementation(() => new Promise((resolve) => {
      resolveDiscovery = resolve;
    }));
    const onChange = vi.fn();

    const cleanup = startProjectTeamContextWatcher('/repo', onChange);
    watchCallbacks.get(n(teamDir))?.();
    vi.advanceTimersByTime(80);
    await Promise.resolve();
    expect(mockDiscoverProjectTeamContext).toHaveBeenCalledWith('/repo');

    cleanup();
    resolveDiscovery?.({
      spaces: [],
      sharedRuleCount: 0,
      workflowCount: 0,
      lastUpdated: undefined,
    });
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });

  it('swallows discovery errors from the debounced refresh', async () => {
    mockDiscoverProjectTeamContext.mockRejectedValue(new Error('discovery failed'));
    const onChange = vi.fn();

    startProjectTeamContextWatcher('/repo', onChange);
    watchCallbacks.get(n(teamDir))?.();
    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(mockDiscoverProjectTeamContext).toHaveBeenCalledWith('/repo');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tolerates unsupported recursive watch paths', () => {
    let watchCall = 0;
    mockWatch.mockImplementation(((
      dirPath: string,
      optionsOrListener: { recursive: boolean } | (() => void),
      maybeListener?: () => void,
    ) => {
      const listener = typeof optionsOrListener === 'function'
        ? optionsOrListener
        : maybeListener;
      if (!listener) {
        throw new Error('listener is required');
      }
      watchCall += 1;
      if (watchCall === 1) {
        throw new Error(`watch unsupported for ${dirPath}`);
      }
      const close = vi.fn();
      closeFns.push(close);
      watchCallbacks.set(n(dirPath), listener);
      return { close } as any;
    }) as any);

    expect(() => startProjectTeamContextWatcher('/repo', vi.fn())).not.toThrow();
    expect(mockWatch).toHaveBeenCalledTimes(4);
    expect(watchCallbacks.has(n(teamDir))).toBe(true);
    expect(watchCallbacks.has(n(rulesDir))).toBe(true);
    expect(watchCallbacks.has(n(workflowsDir))).toBe(true);
  });

  it('continues when one directory cannot be created for watching', () => {
    let mkdirCall = 0;
    mockMkdirSync.mockImplementation(() => {
      mkdirCall += 1;
      if (mkdirCall === 1) {
        throw new Error('mkdir failed');
      }
    });

    expect(() => startProjectTeamContextWatcher('/repo', vi.fn())).not.toThrow();
    expect(mockMkdirSync).toHaveBeenCalledTimes(3);
    expect(mockWatch).toHaveBeenCalledTimes(2);
  });
});
