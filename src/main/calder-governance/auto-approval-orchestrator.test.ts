import { describe, expect, it, vi } from 'vitest';
import type { InspectorEvent } from '../../shared/types.js';
import { createAutoApprovalOrchestrator } from './auto-approval-orchestrator.js';

function permissionRequestEvent(input: {
  toolName: string;
  toolInput?: Record<string, unknown>;
}): InspectorEvent {
  return {
    type: 'permission_request',
    timestamp: 1000,
    hookEvent: 'PermissionRequest',
    tool_name: input.toolName,
    tool_input: input.toolInput,
  };
}

describe('createAutoApprovalOrchestrator', () => {
  it('allows eligible operations, sends approval, and emits approval_decision', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      resolveAutoApprovalState: async () => ({
        effectiveMode: 'edit_plus_safe_tools',
        policySource: 'project',
      }),
    });

    orchestrator.registerSession('session-1', 'codex', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({ toolName: 'Edit' }),
    ]);

    expect(sendApproval).toHaveBeenCalledTimes(1);
    expect(sendApproval).toHaveBeenCalledWith('session-1', 'codex');
    expect(emitInspectorEvents).toHaveBeenCalledTimes(1);
    const emittedEvent = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emittedEvent.type).toBe('approval_decision');
    expect(emittedEvent.auto_approval).toMatchObject({
      policy_source: 'project',
      effective_mode: 'edit_plus_safe_tools',
      operation_class: 'edit',
      decision: 'allow',
    });
  });

  it('blocks destructive requests and does not send approvals', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      resolveAutoApprovalState: async () => ({
        effectiveMode: 'edit_plus_safe_tools',
        policySource: 'project',
      }),
    });

    orchestrator.registerSession('session-1', 'codex', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({
        toolName: 'Bash',
        toolInput: { command: 'rm -rf dist' },
      }),
    ]);

    expect(sendApproval).not.toHaveBeenCalled();
    expect(emitInspectorEvents).toHaveBeenCalledTimes(1);
    const emittedEvent = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emittedEvent.auto_approval).toMatchObject({
      operation_class: 'destructive',
      decision: 'block',
    });
  });

  it('asks when provider does not support auto-approval hooks', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      resolveAutoApprovalState: async () => ({
        effectiveMode: 'edit_plus_safe_tools',
        policySource: 'project',
      }),
    });

    orchestrator.registerSession('session-1', 'minimax', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({ toolName: 'Edit' }),
    ]);

    expect(sendApproval).not.toHaveBeenCalled();
    expect(emitInspectorEvents).toHaveBeenCalledTimes(1);
    const emittedEvent = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emittedEvent.auto_approval).toMatchObject({
      decision: 'ask',
    });
    expect(emittedEvent.auto_approval?.reason).toContain('unsupported');
  });

  it('rate limits rapid approvals by converting second allow to ask', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const nowValues = [1000, 1000, 1200, 1200];
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      now: () => nowValues.shift() ?? 1200,
      rateLimitMs: 1500,
      resolveAutoApprovalState: async () => ({
        effectiveMode: 'edit_plus_safe_tools',
        policySource: 'project',
      }),
    });

    orchestrator.registerSession('session-1', 'codex', '/tmp/project');
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({ toolName: 'Edit' }),
    ]);
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({ toolName: 'Edit' }),
    ]);

    expect(sendApproval).toHaveBeenCalledTimes(1);
    expect(emitInspectorEvents).toHaveBeenCalledTimes(2);
    const secondEvent = emitInspectorEvents.mock.calls[1][1][0] as InspectorEvent;
    expect(secondEvent.auto_approval).toMatchObject({
      decision: 'ask',
    });
    expect(secondEvent.auto_approval?.reason).toContain('rate limited');
  });

  it('honors session override over resolved project policy', async () => {
    const sendApproval = vi.fn();
    const emitInspectorEvents = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      emitInspectorEvents,
      resolveAutoApprovalState: async () => ({
        effectiveMode: 'edit_plus_safe_tools',
        policySource: 'project',
      }),
    });

    orchestrator.registerSession('session-1', 'claude', '/tmp/project');
    orchestrator.setSessionOverride('session-1', 'off');
    await orchestrator.handleInspectorEvents('session-1', [
      permissionRequestEvent({ toolName: 'Edit' }),
    ]);

    expect(sendApproval).not.toHaveBeenCalled();
    const emittedEvent = emitInspectorEvents.mock.calls[0][1][0] as InspectorEvent;
    expect(emittedEvent.auto_approval).toMatchObject({
      policy_source: 'session',
      effective_mode: 'off',
      decision: 'ask',
    });
  });
});
