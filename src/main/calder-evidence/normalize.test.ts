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

  it('maps Claude PostToolUse to tool_completed', () => {
    const mapped = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 7,
      event: baseEvent('tool_use', {
        hookEvent: 'PostToolUse',
        tool_name: 'Read',
      }),
    });
    expect(mapped?.type).toBe('tool_completed');
    expect(mapped?.toolName).toBe('Read');
    expect(mapped?.outcome).toBe('completed');
  });

  it('maps a provider stop event to session_ended', () => {
    const mapped = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 8,
      event: baseEvent('stop', { last_assistant_message: 'done' }),
    });

    expect(mapped).toMatchObject({
      type: 'session_ended',
      source: 'provider_hook',
      confidence: 'provider_reported',
      outcome: 'completed',
      seq: 8,
    });
  });

  it('keeps task lifecycle events available to the visual resolver', () => {
    const created = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 9,
      event: baseEvent('task_created', { task_id: 'task-1' }),
    });
    const completed = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 10,
      event: baseEvent('task_completed', { task_id: 'task-1' }),
    });

    expect(created?.type).toBe('task_created');
    expect(completed?.type).toBe('task_completed');
  });

  it('redacts provider-controlled identifiers before persistence', () => {
    const mapped = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 11,
      event: baseEvent('task_created', {
        hookEvent: 'Authorization: Bearer leaked-provider-token',
        task_id: 'ghp_12345678901234567890',
      }),
    });

    expect(JSON.stringify(mapped)).not.toContain('leaked-provider-token');
    expect(JSON.stringify(mapped)).not.toContain('ghp_12345678901234567890');
    expect(mapped?.sanitizedMeta?.taskId).toMatch(/\[REDACTED:/);
  });

  it('maps subagent and compaction inspector events', () => {
    const subagent = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 5,
      event: baseEvent('subagent_start', { agent_id: 'a1', agent_type: 'explore' }),
    });
    expect(subagent).toMatchObject({
      type: 'subagent_started',
      subagentId: 'a1',
      sanitizedMeta: { subagentId: 'a1', agentType: 'explore' },
    });

    const compact = normalizeInspectorEvent({
      sessionId: 'session-1',
      evidenceRunId: 'run-1',
      providerId: 'claude',
      projectId: 'project-1',
      seq: 6,
      event: baseEvent('pre_compact'),
    });
    expect(compact?.type).toBe('context_compaction_started');
  });
});
