import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InspectorEvent } from '../shared/types/session';

const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockAppendFileSync = vi.hoisted(() => vi.fn());
const mockChmodSync = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/test-home'));

vi.mock('fs', () => ({
  chmodSync: mockChmodSync,
  mkdirSync: mockMkdirSync,
  appendFileSync: mockAppendFileSync,
}));

vi.mock('os', () => ({
  homedir: mockHomedir,
}));

import { appendAutoApprovalAudit, sanitizeInspectorEvents } from './ipc-playwright-mirror';

function makeApprovalDecisionEvent(
  timestamp: number,
  decision: 'allow' | 'ask',
  reason?: string,
): InspectorEvent {
  return {
    type: 'approval_decision',
    timestamp,
    hookEvent: 'ApprovalDecision',
    auto_approval: {
      policy_source: 'project',
      effective_mode: 'project_edits',
      operation_class: 'edit',
      decision,
      reason,
    },
  };
}

describe('ipc playwright mirror runtime helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends audit logs only for approval_decision events with auto_approval metadata', () => {
    appendAutoApprovalAudit('session-1', [
      {
        type: 'status_update',
        timestamp: 1,
        hookEvent: 'StatusUpdate',
      } as InspectorEvent,
      makeApprovalDecisionEvent(2, 'allow', 'auto'),
      {
        type: 'approval_decision',
        timestamp: 3,
        hookEvent: 'ApprovalDecision',
      } as InspectorEvent,
    ]);

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/test-home/.calder/runtime', {
      recursive: true,
      mode: 0o700,
    });
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const [auditPath, payload, options] = mockAppendFileSync.mock.calls[0] as [
      string,
      string,
      { encoding: string; mode: number },
    ];
    expect(auditPath).toBe('/tmp/test-home/.calder/runtime/session-1.auto_approval.log');
    expect(options).toEqual({ encoding: 'utf8', mode: 0o600 });
    expect(payload).toContain('"type":"approval_decision"');
    expect(payload).toContain('"auto_approval"');
  });

  it('returns early when no audit-worthy events are present', () => {
    appendAutoApprovalAudit('session-2', []);
    appendAutoApprovalAudit('session-2', [
      {
        type: 'approval_decision',
        timestamp: 4,
        hookEvent: 'ApprovalDecision',
      } as InspectorEvent,
    ]);

    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('redacts sensitive tool input before renderer or audit delivery', () => {
    const [safe] = sanitizeInspectorEvents([
      {
        ...makeApprovalDecisionEvent(4, 'allow'),
        tool_input: { command: 'curl -H "Authorization: Bearer ghp_12345678901234567890"' },
      },
    ]);

    expect(safe?.tool_input?.command).toContain('[REDACTED:github_token]');
    expect(safe?.tool_input?.command).not.toContain('ghp_');
  });

  it('swallows filesystem exceptions and emits a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockMkdirSync.mockImplementationOnce(() => {
      throw new Error('mkdir failed');
    });

    expect(() =>
      appendAutoApprovalAudit('session-3', [makeApprovalDecisionEvent(5, 'block', 'denied')]),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
