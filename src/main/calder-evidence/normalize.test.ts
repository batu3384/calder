import { describe, expect, it } from 'vitest';

import type { InspectorEvent } from '../../shared/types-session.js';
import { normalizeInspectorEvent } from './normalize.js';

function baseEvent(
  type: InspectorEvent['type'],
  extras: Partial<InspectorEvent> = {},
): InspectorEvent {
  return {
    type,
    timestamp: 1_700_000_000_000,
    hookEvent: type,
    ...extras,
  };
}

describe('calder-evidence normalize', () => {
  it('maps inspector events to evidence events', () => {
    const mapped = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 2,
      event: baseEvent('session_start'),
    });

    expect(mapped).toMatchObject({
      type: 'provider_session_started',
      source: 'provider_hook',
      confidence: 'provider_reported',
      seq: 2,
    });
  });

  it('stores prompt metadata only without raw prompt text', () => {
    const mapped = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 3,
      event: baseEvent('user_prompt', {
        message: 'do not persist this secret prompt',
        last_assistant_message: 'also hidden',
      }),
    });

    expect(mapped?.type).toBe('prompt_submitted');
    expect(JSON.stringify(mapped)).not.toContain('do not persist');
    expect(JSON.stringify(mapped)).not.toContain('also hidden');
    expect(mapped?.sanitizedMeta).toEqual({
      promptLength: 'do not persist this secret prompt'.length,
    });
  });

  it('redacts tool input secrets', () => {
    const mapped = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 4,
      event: baseEvent('tool_use', {
        tool_name: 'Bash',
        tool_input: { command: 'curl -H "Authorization: Bearer leaked-token"' },
      }),
    });

    expect(mapped?.type).toBe('tool_started');
    expect(JSON.stringify(mapped)).not.toContain('leaked-token');
    expect(mapped?.redactedFieldCount).toBeGreaterThan(0);
  });
});
