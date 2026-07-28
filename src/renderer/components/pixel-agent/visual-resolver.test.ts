import { describe, expect, it } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import { pixelStateLabel, resolvePixelVisualState } from './visual-resolver.js';

function event(type: EvidenceEvent['type'], extras: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: 'e1',
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
    ...extras,
  };
}

describe('pixel visual resolver', () => {
  it('blocked beats failed — operation_blocked vs tool_failed', () => {
    const state = resolvePixelVisualState([
      event('tool_failed', { toolName: 'Bash' }),
      event('operation_blocked'),
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

  it('waiting_for_approval outranks active tool work', () => {
    const state = resolvePixelVisualState([
      event('tool_started', { toolName: 'vitest' }),
      event('permission_requested'),
    ]);
    expect(state).toBe('waiting_for_approval');
  });

  it('never uses thinking copy', () => {
    expect(pixelStateLabel('unknown_working')).toBe('Waiting for structured activity');
    expect(pixelStateLabel('preparing')).toBe('Preparing');
    expect(pixelStateLabel('idle')).not.toContain('thinking');
  });
});
