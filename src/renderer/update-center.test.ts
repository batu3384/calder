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
    });
    expect(getUpdateCenterState().cli.activeProviderId).toBe('claude');
    expect(getUpdateCenterState().cli.providers[0].status).toBe('running');

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
});
