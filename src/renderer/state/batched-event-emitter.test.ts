import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BatchedEventEmitter } from './batched-event-emitter.js';

describe('BatchedEventEmitter', () => {
  let previousVitest: string | undefined;

  beforeEach(() => {
    previousVitest = process.env.VITEST;
    delete process.env.VITEST;
  });

  afterEach(() => {
    if (previousVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = previousVitest;
    }
  });

  it('flushes queued emits immediately when flushPending is called', () => {
    const emitter = new BatchedEventEmitter();
    const handler = vi.fn();
    emitter.on('session-changed', handler);
    emitter.emit('session-changed', { id: 's1' });

    expect(handler).not.toHaveBeenCalled();
    emitter.flushPending();
    expect(handler).toHaveBeenCalledWith({ id: 's1' });
  });

  it('deduplicates rapid emits of the same event during flush', () => {
    const emitter = new BatchedEventEmitter();
    const handler = vi.fn();
    emitter.on('project-changed', handler);
    emitter.emit('project-changed', { id: 'p1' });
    emitter.emit('project-changed', { id: 'p2' });

    emitter.flushPending();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: 'p2' });
  });
});
