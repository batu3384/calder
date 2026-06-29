import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockUpdateAllProviders = vi.hoisted(() => vi.fn());
const mockUpdateProviderById = vi.hoisted(() => vi.fn());
const mockInstallProviderById = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('./provider-updater', () => ({
  updateAllProviders: mockUpdateAllProviders,
  updateProviderById: mockUpdateProviderById,
  installProviderById: mockInstallProviderById,
}));

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function requireValue<T>(value: T | null | undefined, message: string): NonNullable<T> {
  if (value == null) {
    throw new Error(message);
  }
  return value as NonNullable<T>;
}

describe('ipc provider-update handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('deduplicates in-flight updateAll requests and emits progress events', async () => {
    let resolveUpdate: ((value: { ok: boolean } | PromiseLike<{ ok: boolean }>) => void) | null =
      null;
    mockUpdateAllProviders.mockImplementation(
      ({ onProgress }: { onProgress: (event: unknown) => void }) => {
        onProgress({ stage: 'starting' });
        return new Promise<{ ok: boolean }>((resolve) => {
          resolveUpdate = resolve;
        });
      },
    );
    const { registerProviderUpdateIpcHandlers } = await import('./ipc-provider-update');
    registerProviderUpdateIpcHandlers();

    const updateAllHandler = getHandleHandler('provider:updateAll');
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const event = { sender };

    const first = updateAllHandler(event);
    const second = updateAllHandler(event);

    expect(mockUpdateAllProviders).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith('provider:update-progress', { stage: 'starting' });

    requireValue<(value: { ok: boolean } | PromiseLike<{ ok: boolean }>) => void>(
      resolveUpdate,
      'Expected update promise resolver to be registered',
    )({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });

    const third = updateAllHandler(event);
    expect(mockUpdateAllProviders).toHaveBeenCalledTimes(2);
    requireValue<(value: { ok: boolean } | PromiseLike<{ ok: boolean }>) => void>(
      resolveUpdate,
      'Expected update promise resolver to be registered',
    )({ ok: true });
    await third;
  });

  it('cancels active updateAll operations via AbortController', async () => {
    let capturedSignal: AbortSignal | null = null;
    mockUpdateAllProviders.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise<never>(() => {});
    });
    const { registerProviderUpdateIpcHandlers } = await import('./ipc-provider-update');
    registerProviderUpdateIpcHandlers();

    const updateAllHandler = getHandleHandler('provider:updateAll');
    const cancelHandler = getHandleHandler('provider:cancelUpdateAll');

    const sender = { isDestroyed: () => false, send: vi.fn() };
    updateAllHandler({ sender });

    const cancelled = await cancelHandler({});
    const cancelledAgain = await cancelHandler({});

    expect(cancelled).toEqual({ cancelled: true });
    expect(cancelledAgain).toEqual({ cancelled: false });
    expect(
      requireValue<AbortSignal>(capturedSignal, 'Expected abort signal to be captured').aborted,
    ).toBe(true);
  });

  it('runs a selected provider update through the same progress and cancellation pipeline', async () => {
    let capturedSignal: AbortSignal | null = null;
    mockUpdateProviderById.mockImplementation(
      (
        providerId: string,
        {
          signal,
          onProgress,
        }: {
          signal: AbortSignal;
          onProgress: (event: unknown) => void;
        },
      ) => {
        capturedSignal = signal;
        onProgress({ phase: 'provider_started', providerId });
        return Promise.resolve({ results: [{ providerId }] });
      },
    );
    const { registerProviderUpdateIpcHandlers } = await import('./ipc-provider-update');
    registerProviderUpdateIpcHandlers();

    const updateProviderHandler = getHandleHandler('provider:updateProvider');
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await expect(updateProviderHandler({ sender }, 'antigravity')).resolves.toEqual({
      results: [{ providerId: 'antigravity' }],
    });

    expect(mockUpdateProviderById).toHaveBeenCalledWith(
      'antigravity',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
    expect(sender.send).toHaveBeenCalledWith('provider:update-progress', {
      phase: 'provider_started',
      providerId: 'antigravity',
    });
    expect(
      requireValue<AbortSignal>(capturedSignal, 'Expected abort signal to be captured').aborted,
    ).toBe(false);
  });

  it('routes installProvider through installProviderById', async () => {
    mockInstallProviderById.mockResolvedValue({ results: [{ providerId: 'codex' }] });
    const { registerProviderUpdateIpcHandlers } = await import('./ipc-provider-update');
    registerProviderUpdateIpcHandlers();

    const installProviderHandler = getHandleHandler('provider:installProvider');
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await expect(installProviderHandler({ sender }, 'codex')).resolves.toEqual({
      results: [{ providerId: 'codex' }],
    });
    expect(mockInstallProviderById).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });
});
