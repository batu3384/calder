import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWatch = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockDiscoverProjectGovernance = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    watch: mockWatch,
  },
}));

vi.mock('./discovery.js', () => ({
  discoverProjectGovernance: mockDiscoverProjectGovernance,
}));

import {
  startProjectGovernanceWatcher,
  stopProjectGovernanceWatcher,
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
  mockMkdirSync.mockReset();
});

afterEach(() => {
  stopProjectGovernanceWatcher();
  vi.useRealTimers();
});

describe('project governance watcher', () => {
  it('watches governance directories and emits refreshed policy data on change', async () => {
    const nextState = {
      policy: {
        id: 'governance:/repo/.calder/governance/policy.json',
        path: '/repo/.calder/governance/policy.json',
        displayName: 'Locked',
        summary: 'enforced · tools block · writes ask · network allow',
        lastUpdated: '2026-04-14T10:00:00.000Z',
        mode: 'enforced',
        toolPolicy: 'block',
        writePolicy: 'ask',
        networkPolicy: 'allow',
        mcpAllowlistCount: 0,
        providerProfileCount: 0,
        budgetLimitUsd: undefined,
      },
      lastUpdated: '2026-04-14T10:00:00.000Z',
    };
    mockDiscoverProjectGovernance.mockResolvedValue(nextState);
    const onChange = vi.fn();

    startProjectGovernanceWatcher('/repo', onChange);
    expect(mockMkdirSync).toHaveBeenCalledWith('/repo/.calder', { recursive: true });
    expect(mockMkdirSync).toHaveBeenCalledWith('/repo/.calder/governance', { recursive: true });
    expect(watchCallbacks.has('/repo/.calder')).toBe(true);
    expect(watchCallbacks.has('/repo/.calder/governance')).toBe(true);

    watchCallbacks.get('/repo/.calder/governance')?.();
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(mockDiscoverProjectGovernance).toHaveBeenCalledWith('/repo');
    expect(onChange).toHaveBeenCalledWith(nextState);
  });

  it('cleans up timers and watchers on stop', async () => {
    mockDiscoverProjectGovernance.mockResolvedValue({});
    const onChange = vi.fn();

    startProjectGovernanceWatcher('/repo', onChange);
    watchCallbacks.get('/repo/.calder')?.();
    stopProjectGovernanceWatcher();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });
});
