import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../shared/types/provider';
import {
  _resetUpdateCenterForTesting,
  checkForAppUpdates,
  getUpdateCenterState,
  initUpdateCenter,
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
    updateProvider: ReturnType<typeof vi.fn>;
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
  updateProvider: ReturnType<typeof vi.fn>;
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
  updateProvider?: (providerId: ProviderId) => Promise<ProviderUpdateSummary>;
  cancelUpdateAll?: () => Promise<{ cancelled: boolean }>;
}): MockApi {
  let onAvailable: UpdateCallback<{ version: string }> | null = null;
  let onProgress: UpdateCallback<{ percent: number }> | null = null;
  let onDownloaded: UpdateCallback<{ version: string }> | null = null;
  let onError: UpdateCallback<{ message: string }> | null = null;
  let onProviderProgress: UpdateCallback<ProviderUpdateProgressEvent> | null = null;

  const checkNow = vi.fn(overrides?.checkNow ?? (async () => {}));
  const updateAll = vi.fn(overrides?.updateAll ?? (async () => buildSummary([])));
  const updateProvider = vi.fn(overrides?.updateProvider ?? (async () => buildSummary([])));
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
      updateProvider,
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
    updateProvider,
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
