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

  it('clears a completed tool into structured thinking', () => {
    const state = resolvePixelVisualState([
      event('tool_started', { toolName: 'Read', seq: 1 }),
      event('tool_completed', { toolName: 'Read', seq: 2, outcome: 'completed' }),
    ]);
    expect(state).toBe('unknown_working');
  });

  it('clears a stopped turn to idle', () => {
    const state = resolvePixelVisualState([
      event('tool_started', { toolName: 'Read', seq: 1 }),
      event('session_ended', { seq: 2, outcome: 'completed' }),
    ]);
    expect(state).toBe('idle');
  });

  it('keeps clean PTY exit in standby instead of completed', () => {
    const state = resolvePixelVisualState([
      event('tool_started', { toolName: 'Read', seq: 1 }),
      event('pty_exited', { seq: 2, outcome: 'completed' }),
    ]);
    expect(state).toBe('idle');
  });

  it('does not let late git observations reopen a completed session', () => {
    const state = resolvePixelVisualState([
      event('session_completed', { seq: 1, outcome: 'completed' }),
      event('git_change_observed', { seq: 2 }),
    ]);
    expect(state).toBe('completed');
  });

  it('does not let late work reopen a stopped turn', () => {
    const state = resolvePixelVisualState([
      event('session_ended', { seq: 1, outcome: 'completed' }),
      event('git_change_observed', { seq: 2 }),
    ]);
    expect(state).toBe('idle');
  });

  it('allows a new prompt to reopen a stopped turn', () => {
    const state = resolvePixelVisualState([
      event('session_ended', { seq: 1, outcome: 'completed' }),
      event('prompt_submitted', { seq: 2 }),
      event('tool_started', { toolName: 'Read', seq: 3 }),
    ]);
    expect(state).toBe('reading_files');
  });

  it('keeps late work behind a failed session barrier', () => {
    const state = resolvePixelVisualState([
      event('session_failed', { seq: 1 }),
      event('tool_started', { toolName: 'Read', seq: 2 }),
    ]);
    expect(state).toBe('failed');
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

  it('maps open PTY to preparing without implying active command work', () => {
    const state = resolvePixelVisualState([event('pty_started', { seq: 1 })]);
    expect(state).toBe('preparing');
  });
});
