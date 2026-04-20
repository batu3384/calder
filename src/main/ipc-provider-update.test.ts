import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockUpdateAllProviders = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('./provider-updater', () => ({
  updateAllProviders: mockUpdateAllProviders,
}));

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

describe('ipc provider-update handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('deduplicates in-flight updateAll requests and emits progress events', async () => {
    let resolveUpdate: ((value: unknown) => void) | null = null;
    mockUpdateAllProviders.mockImplementation(({ onProgress }: { onProgress: (event: unknown) => void }) => {
      onProgress({ stage: 'starting' });
      return new Promise((resolve) => {
        resolveUpdate = resolve;
      });
    });
    const { registerProviderUpdateIpcHandlers } = await import('./ipc-provider-update');
    registerProviderUpdateIpcHandlers();

    const updateAllHandler = getHandleHandler('provider:updateAll');
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const event = { sender };

    const first = updateAllHandler(event);
    const second = updateAllHandler(event);

    expect(mockUpdateAllProviders).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith('provider:update-progress', { stage: 'starting' });

    resolveUpdate?.({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });

    const third = updateAllHandler(event);
    expect(mockUpdateAllProviders).toHaveBeenCalledTimes(2);
    resolveUpdate?.({ ok: true });
    await third;
  });

  it('cancels active updateAll operations via AbortController', async () => {
    let capturedSignal: AbortSignal | null = null;
    mockUpdateAllProviders.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
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
    expect(capturedSignal?.aborted).toBe(true);
  });
});
