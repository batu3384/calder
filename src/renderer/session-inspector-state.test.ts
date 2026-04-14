import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspectorEvent } from '../shared/types';
import {
  addEvents,
  clearSession,
  getContextHistory,
  getCostDeltas,
  getEvents,
  getToolStats,
  onChange,
} from './session-inspector-state';

const createdSessionIds: string[] = [];

function makeSessionId(): string {
  const sessionId = `session-${createdSessionIds.length + 1}`;
  createdSessionIds.push(sessionId);
  return sessionId;
}

function makeEvent(
  type: InspectorEvent['type'],
  timestamp: number,
  extras: Partial<InspectorEvent> = {},
): InspectorEvent {
  return {
    type,
    timestamp,
    hookEvent: `${type}:${timestamp}`,
    ...extras,
  };
}

afterEach(() => {
  while (createdSessionIds.length > 0) {
    clearSession(createdSessionIds.pop()!);
  }
});

describe('session-inspector-state', () => {
  it('caps stored events and drops the oldest entries', () => {
    const sessionId = makeSessionId();
    const events = Array.from({ length: 2005 }, (_, index) =>
      makeEvent('status_update', index, { message: `event-${index}` }),
    );

    addEvents(sessionId, events);

    const stored = getEvents(sessionId);
    expect(stored).toHaveLength(2000);
    expect(stored[0]?.message).toBe('event-5');
    expect(stored.at(-1)?.message).toBe('event-2004');
  });

  it('aggregates tool usage, failures, and cost deltas per tool', () => {
    const sessionId = makeSessionId();

    addEvents(sessionId, [
      makeEvent('tool_use', 1, {
        tool_name: 'open',
        cost_snapshot: { total_cost_usd: 0.5, total_duration_ms: 10 },
      }),
      makeEvent('tool_use', 2, {
        tool_name: 'open',
      }),
      makeEvent('tool_failure', 3, {
        tool_name: 'open',
        cost_snapshot: { total_cost_usd: 0.8, total_duration_ms: 11 },
      }),
      makeEvent('tool_use', 4, {
        tool_name: 'search',
        cost_snapshot: { total_cost_usd: 1.0, total_duration_ms: 12 },
      }),
    ]);

    const stats = getToolStats(sessionId);
    expect(stats).toHaveLength(2);
    expect(stats[0]).toEqual({ tool_name: 'open', calls: 3, failures: 1, totalCost: 0.8 });
    expect(stats[1]?.tool_name).toBe('search');
    expect(stats[1]?.calls).toBe(1);
    expect(stats[1]?.failures).toBe(0);
    expect(stats[1]?.totalCost).toBeCloseTo(0.2, 10);
  });

  it('returns context history in timestamp order', () => {
    const sessionId = makeSessionId();

    addEvents(sessionId, [
      makeEvent('user_prompt', 1),
      makeEvent('status_update', 2, {
        context_snapshot: { total_tokens: 1200, context_window_size: 200000, used_percentage: 0.6 },
      }),
      makeEvent('status_update', 3, {
        context_snapshot: { total_tokens: 4000, context_window_size: 200000, used_percentage: 2 },
      }),
    ]);

    expect(getContextHistory(sessionId)).toEqual([
      { timestamp: 2, usedPercentage: 0.6, totalTokens: 1200 },
      { timestamp: 3, usedPercentage: 2, totalTokens: 4000 },
    ]);
  });

  it('caches cost deltas until the session receives new events', () => {
    const sessionId = makeSessionId();

    addEvents(sessionId, [
      makeEvent('tool_use', 1, {
        tool_name: 'open',
        cost_snapshot: { total_cost_usd: 0.25, total_duration_ms: 10 },
      }),
      makeEvent('tool_use', 2, {
        tool_name: 'search',
        cost_snapshot: { total_cost_usd: 0.4, total_duration_ms: 11 },
      }),
    ]);

    const first = getCostDeltas(sessionId);
    const second = getCostDeltas(sessionId);
    expect(second).toBe(first);
    expect(second).toEqual([
      { index: 0, delta: 0.25 },
      { index: 1, delta: 0.15000000000000002 },
    ]);

    addEvents(sessionId, [
      makeEvent('tool_use', 3, {
        tool_name: 'write',
        cost_snapshot: { total_cost_usd: 1.0, total_duration_ms: 12 },
      }),
    ]);

    const third = getCostDeltas(sessionId);
    expect(third).not.toBe(first);
    expect(third).toEqual([
      { index: 0, delta: 0.25 },
      { index: 1, delta: 0.15000000000000002 },
      { index: 2, delta: 0.6 },
    ]);
  });

  it('notifies listeners when new events are added', () => {
    const sessionId = makeSessionId();
    const listener = vi.fn();
    onChange(listener);

    addEvents(sessionId, [makeEvent('status_update', 1)]);

    expect(listener).toHaveBeenCalledWith(sessionId);
  });
});
