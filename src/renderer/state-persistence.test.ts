import { describe, expect, it, vi } from 'vitest';

import { RendererPersistQueue } from './state-persistence.js';

describe('RendererPersistQueue', () => {
  it('retries the latest snapshot after a failed save', async () => {
    vi.useRealTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const queue = new RendererPersistQueue(save, onError);

    queue.enqueue({ version: 1, projects: [], activeProjectId: null, preferences: {} } as never);
    queue.enqueue({
      version: 1,
      projects: [{ id: 'p1' }],
      activeProjectId: 'p1',
      preferences: {},
    } as never);

    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    await vi.waitFor(
      () => {
        const savedLatest = save.mock.calls.some(
          (call) =>
            call[0]?.activeProjectId === 'p1' &&
            save.mock.results[save.mock.calls.length - 1]?.type !== 'throw',
        );
        expect(savedLatest).toBe(true);
      },
      { timeout: 2000 },
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(save.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ activeProjectId: 'p1' }));
  });
});
