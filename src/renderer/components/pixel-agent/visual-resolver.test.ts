import { describe, expect, it } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import { pixelStateLabel, resolvePixelVisualState } from './visual-resolver.js';

function event(type: EvidenceEvent['type'], extras: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: extras.eventId ?? `event-${type}-${extras.seq ?? 1}`,
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: extras.timestamp ?? Date.now(),
    seq: extras.seq ?? 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
    ...extras,
  };
}

describe('pixel visual resolver', () => {
  it('blocked beats failed when blocked is later', () => {
    const state = resolvePixelVisualState([
      event('tool_failed', { toolName: 'Bash', seq: 1 }),
      event('operation_blocked', { seq: 2 }),
    ]);
    expect(state).toBe('blocked');
  });

  it('permission_denied maps to blocked not failed', () => {
    const state = resolvePixelVisualState([event('permission_denied')]);
    expect(state).toBe('blocked');
  });

  it('provider_session_failed maps to failed', () => {
    const state = resolvePixelVisualState([event('provider_session_failed')]);
    expect(state).toBe('failed');
  });

  it('waiting_for_approval outranks active tool work while unresolved', () => {
    const state = resolvePixelVisualState([
      event('tool_started', { toolName: 'vitest', seq: 1 }),
      event('permission_requested', { seq: 2 }),
    ]);
    expect(state).toBe('waiting_for_approval');
  });

  it('permission_approved clears waiting so later tools show', () => {
    const state = resolvePixelVisualState([
      event('permission_requested', { seq: 1 }),
      event('permission_approved', { seq: 2 }),
      event('tool_started', { toolName: 'vitest', seq: 3 }),
    ]);
    expect(state).toBe('running_tests');
  });

  it('session completion clears earlier waiting gate', () => {
    const state = resolvePixelVisualState([
      event('permission_requested', { seq: 1 }),
      event('session_completed', { seq: 2, outcome: 'completed' }),
    ]);
    expect(state).toBe('completed');
  });

  it('later tool work clears earlier blocked', () => {
    const state = resolvePixelVisualState([
      event('operation_blocked', { seq: 1 }),
      event('tool_started', { toolName: 'Read', seq: 2 }),
    ]);
    expect(state).toBe('reading_files');
  });

  it('drops stale active tool work after five minutes', () => {
    const now = Date.now();
    const state = resolvePixelVisualState(
      [
        event('tool_started', {
          toolName: 'vitest',
          timestamp: now - 6 * 60 * 1000,
          seq: 1,
        }),
      ],
      now,
    );
    expect(state).toBe('idle');
  });

  it('drops stale interrupt states after five minutes', () => {
    const now = Date.now();
    const state = resolvePixelVisualState(
      [event('operation_blocked', { timestamp: now - 6 * 60 * 1000, seq: 1 })],
      now,
    );
    expect(state).toBe('idle');
  });

  it('never uses thinking copy', () => {
    expect(pixelStateLabel('unknown_working')).toBe('Pixel state: Waiting for structured activity');
    expect(pixelStateLabel('preparing')).toBe('Pixel state: Preparing');
    expect(pixelStateLabel('idle')).not.toContain('thinking');
  });
});
