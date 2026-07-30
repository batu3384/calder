import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPtyWriteBatcher } from './pty-write-batch.js';

describe('createPtyWriteBatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces multiple chunks into one write per frame', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const batcher = createPtyWriteBatcher(write);

    batcher.enqueue('s1', 'a');
    batcher.enqueue('s1', 'b');
    batcher.enqueue('s1', 'c');
    expect(write).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('s1', 'abc');
  });

  it('keeps sessions independent while flushing once', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const batcher = createPtyWriteBatcher(write);

    batcher.enqueue('s1', 'x');
    batcher.enqueue('s2', 'y');
    vi.runAllTimers();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith('s1', 'x');
    expect(write).toHaveBeenCalledWith('s2', 'y');
  });

  it('clear drops pending data without writing', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const batcher = createPtyWriteBatcher(write);

    batcher.enqueue('s1', 'nope');
    batcher.clear('s1');
    vi.runAllTimers();
    expect(write).not.toHaveBeenCalled();
  });

  it('flush writes pending data immediately before dispose', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const batcher = createPtyWriteBatcher(write);

    batcher.enqueue('s1', 'tail');
    batcher.flush('s1');
    expect(write).toHaveBeenCalledWith('s1', 'tail');
    vi.runAllTimers();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
