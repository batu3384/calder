import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../shared/types';
import {
  _resetUpdateCenterForTesting,
  cancelCliProviderUpdates,
  checkForAppUpdates,
  getUpdateCenterState,
  initUpdateCenter,
  runCliProviderUpdates,
} from './update-center';

type UpdateCallback<T> = (payload: T) => void;

interface MockApi {
  update: {
    checkNow: ReturnType<typeof vi.fn>;
    install: ReturnType<typeof vi.fn>;
    onAvailable(cb: UpdateCallback<{ version: string }>): () => void;
    onDownloadProgress(cb: UpdateCallback<{ percent: number }>): () => void;
    onDownloaded(cb: UpdateCallback<{ version: string }>): () => void;
    onError(cb: UpdateCallback<{ message: string }>): () => void;
  };
  provider: {
    updateAll: ReturnType<typeof vi.fn>;
    cancelUpdateAll: ReturnType<typeof vi.fn>;
    onUpdateProgress(cb: UpdateCallback<ProviderUpdateProgressEvent>): () => void;
  };
  emitAppAvailable(info: { version: string }): void;
  emitAppDownloadProgress(info: { percent: number }): void;
  emitAppDownloaded(info: { version: string }): void;
  emitAppError(info: { message: string }): void;
  emitProviderProgress(event: ProviderUpdateProgressEvent): void;
  checkNow: ReturnType<typeof vi.fn>;
  updateAll: ReturnType<typeof vi.fn>;
  cancelUpdateAll: ReturnType<typeof vi.fn>;
}

function buildSummary(results: ProviderUpdateResult[]): ProviderUpdateSummary {
  return {
    startedAt: '2026-04-16T09:00:00.000Z',
    finishedAt: '2026-04-16T09:00:10.000Z',
    results,
  };
}

function createMockApi(overrides?: {
  checkNow?: () => Promise<void>;
  updateAll?: () => Promise<ProviderUpdateSummary>;
  cancelUpdateAll?: () => Promise<{ cancelled: boolean }>;
}): MockApi {
  let onAvailable: UpdateCallback<{ version: string }> | null = null;
  let onProgress: UpdateCallback<{ percent: number }> | null = null;
  let onDownloaded: UpdateCallback<{ version: string }> | null = null;
  let onError: UpdateCallback<{ message: string }> | null = null;
  let onProviderProgress: UpdateCallback<ProviderUpdateProgressEvent> | null = null;

  const checkNow = vi.fn(overrides?.checkNow ?? (async () => {}));
  const updateAll = vi.fn(overrides?.updateAll ?? (async () => buildSummary([])));
  const cancelUpdateAll = vi.fn(overrides?.cancelUpdateAll ?? (async () => ({ cancelled: true })));

  const api = {
    update: {
      checkNow,
      install: vi.fn(async () => {}),
      onAvailable: (cb: UpdateCallback<{ version: string }>) => {
        onAvailable = cb;
        return () => {
          if (onAvailable === cb) onAvailable = null;
        };
      },
      onDownloadProgress: (cb: UpdateCallback<{ percent: number }>) => {
        onProgress = cb;
        return () => {
          if (onProgress === cb) onProgress = null;
        };
      },
      onDownloaded: (cb: UpdateCallback<{ version: string }>) => {
        onDownloaded = cb;
        return () => {
          if (onDownloaded === cb) onDownloaded = null;
        };
      },
      onError: (cb: UpdateCallback<{ message: string }>) => {
        onError = cb;
        return () => {
          if (onError === cb) onError = null;
        };
      },
    },
    provider: {
      updateAll,
      cancelUpdateAll,
      onUpdateProgress: (cb: UpdateCallback<ProviderUpdateProgressEvent>) => {
        onProviderProgress = cb;
        return () => {
          if (onProviderProgress === cb) onProviderProgress = null;
        };
      },
    },
  };

  return {
    ...api,
    emitAppAvailable(info) {
      onAvailable?.(info);
    },
    emitAppDownloadProgress(info) {
      onProgress?.(info);
    },
    emitAppDownloaded(info) {
      onDownloaded?.(info);
    },
    emitAppError(info) {
      onError?.(info);
    },
    emitProviderProgress(event) {
      onProviderProgress?.(event);
    },
    checkNow,
    updateAll,
    cancelUpdateAll,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  _resetUpdateCenterForTesting();
});

afterEach(() => {
  _resetUpdateCenterForTesting();
  vi.useRealTimers();
});

describe('update center app updates', () => {
  it('marks app updates as up to date when no events arrive after timeout', async () => {
    const mockApi = createMockApi();
    initUpdateCenter(mockApi as any);

    await checkForAppUpdates();
    expect(getUpdateCenterState().app.phase).toBe('checking');

    await vi.advanceTimersByTimeAsync(6500);
    expect(getUpdateCenterState().app.phase).toBe('up_to_date');
    expect(getUpdateCenterState().app.lastCheckedAt).toBeTruthy();
    expect(mockApi.checkNow).toHaveBeenCalledTimes(1);
  });

  it('tracks available, download progress, and downloaded phases', async () => {
    const mockApi = createMockApi();
    initUpdateCenter(mockApi as any);

    await checkForAppUpdates();
    mockApi.emitAppAvailable({ version: '1.4.0' });
    expect(getUpdateCenterState().app.phase).toBe('downloading');
    expect(getUpdateCenterState().app.targetVersion).toBe('1.4.0');

    mockApi.emitAppDownloadProgress({ percent: 31 });
    expect(getUpdateCenterState().app.downloadPercent).toBe(31);

    mockApi.emitAppDownloaded({ version: '1.4.0' });
    expect(getUpdateCenterState().app.phase).toBe('ready_to_restart');
    expect(getUpdateCenterState().app.targetVersion).toBe('1.4.0');
  });

  it('surfaces check failures as app error state', async () => {
    const mockApi = createMockApi({
      checkNow: async () => {
        throw new Error('network unreachable');
      },
    });
    initUpdateCenter(mockApi as any);

    await checkForAppUpdates();
    const app = getUpdateCenterState().app;
    expect(app.phase).toBe('error');
    expect(app.errorMessage).toBe('network unreachable');
    expect(app.lastCheckedAt).toBeTruthy();
  });
});

describe('update center cli updates', () => {
  it('tracks provider progress while provider updates run', async () => {
    let resolveSummary: ((value: ProviderUpdateSummary) => void) | null = null;
    const summary = buildSummary([
      {
        providerId: 'claude',
        providerName: 'Claude Code',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'Claude Code was updated successfully.',
        durationMs: 200,
      },
    ]);
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolveSummary = resolve; }),
    });
    initUpdateCenter(mockApi as any);

    const updatePromise = runCliProviderUpdates();
    expect(getUpdateCenterState().cli.phase).toBe('running');

    mockApi.emitProviderProgress({
      phase: 'started',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 2,
      completedProviders: 0,
      providers: [
        { providerId: 'claude', providerName: 'Claude Code' },
        { providerId: 'minimax', providerName: 'MiniMax CLI' },
      ],
    });
    expect(getUpdateCenterState().cli.providers).toHaveLength(2);
    expect(getUpdateCenterState().cli.providers[0].status).toBe('queued');

    mockApi.emitProviderProgress({
      phase: 'provider_started',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 2,
      completedProviders: 0,
      providerId: 'claude',
      providerName: 'Claude Code',
      providerMessage: 'Checking latest version…',
    });
    expect(getUpdateCenterState().cli.activeProviderId).toBe('claude');
    expect(getUpdateCenterState().cli.providers[0].status).toBe('running');
    expect(getUpdateCenterState().cli.providers[0].message).toBe('Checking latest version…');

    mockApi.emitProviderProgress({
      phase: 'provider_started',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 2,
      completedProviders: 0,
      providerId: 'claude',
      providerName: 'Claude Code',
      providerMessage: 'Applying update command…',
    });
    expect(getUpdateCenterState().cli.activeProviderId).toBe('claude');
    expect(getUpdateCenterState().cli.providers[0].status).toBe('running');
    expect(getUpdateCenterState().cli.providers[0].message).toBe('Applying update command…');

    const providerResult: ProviderUpdateResult = {
      providerId: 'claude',
      providerName: 'Claude Code',
      source: 'self',
      status: 'updated',
      checked: true,
      updateAttempted: true,
      message: 'Claude Code was updated successfully.',
      durationMs: 200,
    };
    mockApi.emitProviderProgress({
      phase: 'provider_finished',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 2,
      completedProviders: 1,
      providerId: 'claude',
      providerName: 'Claude Code',
      result: providerResult,
    });
    expect(getUpdateCenterState().cli.providers[0].status).toBe('updated');
    expect(getUpdateCenterState().cli.completedProviders).toBe(1);

    resolveSummary?.(summary);
    await updatePromise;

    expect(getUpdateCenterState().cli.phase).toBe('completed');
    expect(getUpdateCenterState().cli.lastSummary?.results[0].providerId).toBe('claude');
    expect(mockApi.updateAll).toHaveBeenCalledTimes(1);
  });

  it('returns the same in-flight promise when updates are already running', async () => {
    const summary = buildSummary([
      {
        providerId: 'claude' as ProviderId,
        providerName: 'Claude Code',
        source: 'self',
        status: 'up_to_date',
        checked: true,
        updateAttempted: false,
        message: 'Claude Code is already up to date.',
        durationMs: 10,
      },
    ]);
    let resolveSummary: ((value: ProviderUpdateSummary) => void) | null = null;
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolveSummary = resolve; }),
    });
    initUpdateCenter(mockApi as any);

    const first = runCliProviderUpdates();
    const second = runCliProviderUpdates();

    expect(second).toBe(first);

    resolveSummary?.(summary);
    await first;
  });

  it('requests cancellation and transitions to cancelled phase when updater reports cancellation', async () => {
    let resolveSummary: ((value: ProviderUpdateSummary) => void) | null = null;
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolveSummary = resolve; }),
      cancelUpdateAll: async () => ({ cancelled: true }),
    });
    initUpdateCenter(mockApi as any);

    const updatePromise = runCliProviderUpdates();
    mockApi.emitProviderProgress({
      phase: 'started',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 2,
      completedProviders: 0,
      providers: [
        { providerId: 'claude', providerName: 'Claude Code' },
        { providerId: 'codex', providerName: 'Codex CLI' },
      ],
    });

    const cancelResult = await cancelCliProviderUpdates();
    expect(cancelResult).toEqual({ cancelled: true });
    expect(getUpdateCenterState().cli.cancelRequested).toBe(true);

    resolveSummary?.({
      startedAt: '2026-04-16T09:00:00.000Z',
      finishedAt: '2026-04-16T09:00:05.000Z',
      cancelled: true,
      results: [
        {
          providerId: 'claude',
          providerName: 'Claude Code',
          source: 'self',
          status: 'cancelled',
          checked: true,
          updateAttempted: true,
          message: 'Update cancelled while command was running.',
          durationMs: 5000,
        },
      ],
    });
    await updatePromise;

    const cliState = getUpdateCenterState().cli;
    expect(cliState.phase).toBe('cancelled');
    expect(cliState.cancelRequested).toBe(false);
    expect(mockApi.cancelUpdateAll).toHaveBeenCalledTimes(1);
  });

  it('surfaces updater failures as cli error state and rethrows', async () => {
    const mockApi = createMockApi({
      updateAll: async () => {
        throw new Error('provider updater crashed');
      },
    });
    initUpdateCenter(mockApi as any);

    await expect(runCliProviderUpdates()).rejects.toThrow('provider updater crashed');
    const cli = getUpdateCenterState().cli;
    expect(cli.phase).toBe('error');
    expect(cli.errorMessage).toBe('provider updater crashed');
    expect(cli.cancelRequested).toBe(false);
  });

  it('does not carry stale providers into a new run when no progress events are emitted', async () => {
    const firstRunSummary = buildSummary([
      {
        providerId: 'claude',
        providerName: 'Claude Code',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'Claude Code was updated successfully.',
        durationMs: 100,
      },
      {
        providerId: 'codex',
        providerName: 'Codex CLI',
        source: 'npm',
        status: 'up_to_date',
        checked: true,
        updateAttempted: false,
        message: 'Codex CLI is already up to date.',
        durationMs: 110,
      },
    ]);
    const secondRunSummary = buildSummary([
      {
        providerId: 'minimax',
        providerName: 'MiniMax CLI',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'MiniMax CLI was updated successfully.',
        durationMs: 95,
      },
    ]);

    const summaries = [firstRunSummary, secondRunSummary];
    const mockApi = createMockApi({
      updateAll: async () => summaries.shift() ?? buildSummary([]),
    });
    initUpdateCenter(mockApi as any);

    await runCliProviderUpdates();
    const firstState = getUpdateCenterState().cli;
    expect(firstState.providers.map((provider) => provider.providerId)).toEqual(['claude', 'codex']);

    // Second run intentionally emits no provider progress events; final state should be derived from summary only.
    await runCliProviderUpdates();
    const secondState = getUpdateCenterState().cli;
    expect(secondState.providers.map((provider) => provider.providerId)).toEqual(['minimax']);
    expect(secondState.totalProviders).toBe(1);
    expect(secondState.completedProviders).toBe(1);
  });

  it('returns cancelled=false when cancellation is requested while no run is active', async () => {
    const mockApi = createMockApi();
    initUpdateCenter(mockApi as any);

    const result = await cancelCliProviderUpdates();
    expect(result).toEqual({ cancelled: false });
    expect(mockApi.cancelUpdateAll).not.toHaveBeenCalled();
  });

  it('clears cancelRequested when provider cancel endpoint declines cancellation', async () => {
    let resolveSummary: ((value: ProviderUpdateSummary) => void) | null = null;
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolveSummary = resolve; }),
      cancelUpdateAll: async () => ({ cancelled: false }),
    });
    initUpdateCenter(mockApi as any);

    const updatePromise = runCliProviderUpdates();
    const cancelResult = await cancelCliProviderUpdates();
    expect(cancelResult).toEqual({ cancelled: false });
    expect(getUpdateCenterState().cli.cancelRequested).toBe(false);

    resolveSummary?.(buildSummary([]));
    await updatePromise;
  });

  it('ignores stale progress events from a previous run after a new run starts', async () => {
    const resolvers: Array<(value: ProviderUpdateSummary) => void> = [];
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolvers.push(resolve); }),
    });
    initUpdateCenter(mockApi as any);

    const runOne = runCliProviderUpdates();
    mockApi.emitProviderProgress({
      phase: 'started',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 1,
      completedProviders: 0,
      providers: [{ providerId: 'claude', providerName: 'Claude Code' }],
    });
    resolvers[0]?.(buildSummary([
      {
        providerId: 'claude',
        providerName: 'Claude Code',
        source: 'self',
        status: 'up_to_date',
        checked: true,
        updateAttempted: false,
        message: 'Claude Code is already up to date.',
        durationMs: 50,
      },
    ]));
    await runOne;

    const runTwo = runCliProviderUpdates();
    mockApi.emitProviderProgress({
      phase: 'started',
      startedAt: '2026-04-16T09:10:00.000Z',
      totalProviders: 1,
      completedProviders: 0,
      providers: [{ providerId: 'minimax', providerName: 'MiniMax CLI' }],
    });

    // Simulate a delayed progress event from run one. This must not pollute run two state.
    mockApi.emitProviderProgress({
      phase: 'provider_finished',
      startedAt: '2026-04-16T09:00:00.000Z',
      totalProviders: 1,
      completedProviders: 1,
      providerId: 'claude',
      providerName: 'Claude Code',
      result: {
        providerId: 'claude',
        providerName: 'Claude Code',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'Claude Code was updated successfully.',
        durationMs: 100,
      },
    });

    const midState = getUpdateCenterState().cli;
    expect(midState.providers.map((provider) => provider.providerId)).toEqual(['minimax']);
    expect(midState.activeProviderId).toBeUndefined();

    resolvers[1]?.(buildSummary([
      {
        providerId: 'minimax',
        providerName: 'MiniMax CLI',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'MiniMax CLI was updated successfully.',
        durationMs: 60,
      },
    ]));
    await runTwo;
  });

  it('ignores provider events until current run emits started', async () => {
    const resolvers: Array<(value: ProviderUpdateSummary) => void> = [];
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolvers.push(resolve); }),
    });
    initUpdateCenter(mockApi as any);

    const runOne = runCliProviderUpdates();
    mockApi.emitProviderProgress({
      phase: 'started',
      startedAt: '2026-04-16T10:00:00.000Z',
      totalProviders: 1,
      completedProviders: 0,
      providers: [{ providerId: 'claude', providerName: 'Claude Code' }],
    });
    resolvers[0]?.(buildSummary([
      {
        providerId: 'claude',
        providerName: 'Claude Code',
        source: 'self',
        status: 'up_to_date',
        checked: true,
        updateAttempted: false,
        message: 'Claude Code is already up to date.',
        durationMs: 40,
      },
    ]));
    await runOne;

    const runTwo = runCliProviderUpdates();
    // Late event from previous run arrives before new run emits `started`.
    mockApi.emitProviderProgress({
      phase: 'provider_finished',
      startedAt: '2026-04-16T10:00:00.000Z',
      totalProviders: 1,
      completedProviders: 1,
      providerId: 'claude',
      providerName: 'Claude Code',
      result: {
        providerId: 'claude',
        providerName: 'Claude Code',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'Claude Code was updated successfully.',
        durationMs: 90,
      },
    });

    const midState = getUpdateCenterState().cli;
    expect(midState.providers).toEqual([]);
    expect(midState.completedProviders).toBe(0);

    resolvers[1]?.(buildSummary([
      {
        providerId: 'minimax',
        providerName: 'MiniMax CLI',
        source: 'self',
        status: 'updated',
        checked: true,
        updateAttempted: true,
        message: 'MiniMax CLI was updated successfully.',
        durationMs: 60,
      },
    ]));
    await runTwo;
  });

  it('resets cancelRequested and surfaces errors when cancel request fails', async () => {
    let resolveSummary: ((value: ProviderUpdateSummary) => void) | null = null;
    const mockApi = createMockApi({
      updateAll: () => new Promise((resolve) => { resolveSummary = resolve; }),
      cancelUpdateAll: async () => {
        throw new Error('cancel endpoint unavailable');
      },
    });
    initUpdateCenter(mockApi as any);

    const updatePromise = runCliProviderUpdates();
    await expect(cancelCliProviderUpdates()).rejects.toThrow('cancel endpoint unavailable');
    const cli = getUpdateCenterState().cli;
    expect(cli.cancelRequested).toBe(false);
    expect(cli.errorMessage).toBe('cancel endpoint unavailable');

    resolveSummary?.(buildSummary([]));
    await updatePromise;
  });
});
