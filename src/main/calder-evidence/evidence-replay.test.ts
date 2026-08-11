import { describe, expect, it } from 'vitest';

import { replayEvidenceTail } from './evidence-replay.js';

describe('evidence subscription replay', () => {
  it('reads bounded tail from current event count', () => {
    const calls: Array<{ runId: string; offset: number; limit: number }> = [];
    const events = [{ eventId: 'e-121', seq: 121 }] as never[];

    const replayed = replayEvidenceTail('run-1', 121, (runId, options) => {
      calls.push({ runId, offset: options.offset ?? 0, limit: options.limit ?? 0 });
      return events;
    });

    expect(calls).toEqual([{ runId: 'run-1', offset: 1, limit: 120 }]);
    expect(replayed).toBe(events);
  });
});
