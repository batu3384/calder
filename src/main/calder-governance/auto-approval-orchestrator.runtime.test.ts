import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InspectorEvent } from '../../shared/types/session.js';

const mockDiscoverProjectGovernance = vi.hoisted(() => vi.fn());

vi.mock('./discovery.js', () => ({
  discoverProjectGovernance: mockDiscoverProjectGovernance,
}));

import { createAutoApprovalOrchestrator } from './auto-approval-orchestrator.js';

function permissionRequestEvent(overrides: Partial<InspectorEvent> = {}): InspectorEvent {
  return {
    type: 'permission_request',
    timestamp: 1000,
    hookEvent: 'PermissionRequest',
    tool_name: 'Edit',
    tool_input: { file_path: 'README.md' },
    cwd: '/tmp/project',
    ...overrides,
  };
}

describe('auto approval orchestrator runtime branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses fallback off mode when project path is missing in default resolver', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
    });

    orchestrator.registerSession('session-1', 'codex', null);
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({ cwd: undefined }),
    ]);

    expect(mockDiscoverProjectGovernance).not.toHaveBeenCalled();
    expect(sendApproval).not.toHaveBeenCalled();
    const emitted = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emitted.auto_approval).toMatchObject({
      policy_source: 'fallback',
      effective_mode: 'off',
      decision: 'ask',
    });
  });

  it('resolves policy from discovered governance and allows updates when auto approval is enabled', async () => {
    mockDiscoverProjectGovernance.mockResolvedValue({
      autoApproval: {
        effectiveMode: 'full_auto',
        policySource: 'project',
      },
    });
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
    });

    orchestrator.registerSession('session-2', 'codex', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-2', [permissionRequestEvent()]);

    expect(mockDiscoverProjectGovernance).toHaveBeenCalledWith('/tmp/project');
    expect(sendApproval).toHaveBeenCalledWith('session-2', 'codex');
    const emitted = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emitted.auto_approval).toMatchObject({
      policy_source: 'project',
      effective_mode: 'full_auto',
      decision: 'allow',
    });
  });

  it('falls back when discovered governance omits autoApproval state', async () => {
    mockDiscoverProjectGovernance.mockResolvedValue({});
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
    });

    orchestrator.registerSession('session-3', 'codex', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-3', [permissionRequestEvent()]);

    expect(sendApproval).not.toHaveBeenCalled();
    const emitted = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emitted.auto_approval).toMatchObject({
      policy_source: 'fallback',
      effective_mode: 'off',
      decision: 'ask',
    });
  });

  it('uses non-Error thrown policy failures in emitted reason text', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      resolveAutoApprovalState: async () => {
        throw 'resolver-string-error';
      },
    });

    orchestrator.registerSession('session-4', 'codex', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-4', [permissionRequestEvent()]);

    expect(sendApproval).not.toHaveBeenCalled();
    const emitted = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emitted.auto_approval?.reason).toContain('resolver-string-error');
  });

  it('supports override removal/unregister lifecycle and handles circular tool inputs', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const nowValues = [1_000, 1_000, 2_000, 2_000];
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      now: () => nowValues.shift() ?? 2_000,
      resolveAutoApprovalState: async () => ({
        effectiveMode: 'full_auto_unsafe',
        policySource: 'project',
      }),
    });

    orchestrator.registerSession('session-5', 'codex', '/tmp/project');
    orchestrator.setSessionOverride('session-5', 'full_auto_unsafe');
    expect(orchestrator.getSessionOverride('session-5')).toBe('full_auto_unsafe');
    orchestrator.setSessionOverride('session-5', null);
    expect(orchestrator.getSessionOverride('session-5')).toBeUndefined();

    const circularInput: Record<string, unknown> = { command: 'echo ok', args: ['--flag', 42] };
    circularInput.self = circularInput;

    await orchestrator.handleInspectorEvents('session-5', [
      permissionRequestEvent({
        tool_name: 'Bash',
        tool_input: circularInput,
      }),
    ]);

    expect(sendApproval).toHaveBeenCalledTimes(1);
    orchestrator.unregisterSession('session-5');
    await orchestrator.handleInspectorEvents('session-5', [
      permissionRequestEvent({ tool_name: 'Edit' }),
    ]);
    expect(emitInspectorEvents).toHaveBeenCalledTimes(1);
  });
});
