import { describe, expect, it } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import {
  countActiveSubagents,
  resolvePixelStudioPresentation,
  resolveStudioStation,
} from './studio-resolver.js';

function event(type: EvidenceEvent['type'], extras: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: extras.eventId ?? `event-${type}`,
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: extras.timestamp ?? Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
    ...extras,
  };
}

describe('pixel studio resolver', () => {
  it('maps approval to security station', () => {
    expect(resolveStudioStation('waiting_for_approval')).toBe('security');
  });

  it('maps tool work to terminal and test stations', () => {
    expect(resolveStudioStation('running_command')).toBe('terminal');
    expect(resolveStudioStation('running_tests')).toBe('test_build');
  });

  it('prefers git station when recent git activity is present', () => {
    const now = Date.now();
    const presentation = resolvePixelStudioPresentation(
      [
        event('tool_started', { toolName: 'Read', timestamp: now - 1_000 }),
        event('git_change_observed', {
          timestamp: now - 500,
          sanitizedPaths: ['src/app.ts'],
        }),
      ],
      now,
    );
    expect(presentation.station).toBe('git');
  });

  it('counts active subagents from start/complete delta', () => {
    const now = Date.now();
    const count = countActiveSubagents(
      [
        event('subagent_started', { timestamp: now - 1_000, subagentId: 'a1' }),
        event('subagent_started', { timestamp: now - 500, subagentId: 'a2' }),
        event('subagent_completed', { timestamp: now - 250, subagentId: 'a1' }),
      ],
      now,
    );
    expect(count).toBe(1);
  });

  it('closes id-less subagents FIFO on complete', () => {
    const now = Date.now();
    const count = countActiveSubagents(
      [
        event('subagent_started', { eventId: 's1', timestamp: now - 1_000 }),
        event('subagent_started', { eventId: 's2', timestamp: now - 500 }),
        event('subagent_completed', { eventId: 'c1', timestamp: now - 250 }),
      ],
      now,
    );
    expect(count).toBe(1);
  });

  it('maps terminal states to studio scenes', () => {
    const now = Date.now();
    const completed = resolvePixelStudioPresentation(
      [event('session_completed', { outcome: 'completed', timestamp: now })],
      now,
    );
    expect(completed.scene).toBe('celebration');

    const failed = resolvePixelStudioPresentation([event('tool_failed', { timestamp: now })], now);
    expect(failed.scene).toBe('error');
  });
});
