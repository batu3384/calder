import { randomUUID } from 'node:crypto';

import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceConfidence,
  type EvidenceEvent,
  type EvidenceEventType,
  type EvidenceSource,
} from '../../shared/types-evidence.js';
import type { InspectorEvent } from '../../shared/types-session.js';
import { applyRedactionToMeta, redactHomePaths, redactValue } from './redact.js';

export interface NormalizeInspectorInput {
  sessionId: string;
  evidenceRunId: string;
  providerId: string;
  projectId: string;
  event: InspectorEvent;
  seq: number;
}

interface EventMapping {
  type: EvidenceEventType;
  source: EvidenceSource;
  confidence: EvidenceConfidence;
  outcome?: string;
}

function baseEvent(
  input: NormalizeInspectorInput,
  mapping: EventMapping,
  extras?: Partial<EvidenceEvent>,
): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: randomUUID(),
    evidenceRunId: input.evidenceRunId,
    calderSessionId: input.sessionId,
    providerId: input.providerId,
    projectId: input.projectId,
    type: mapping.type,
    providerEventName: input.event.hookEvent || input.event.type,
    timestamp: input.event.timestamp,
    seq: input.seq,
    source: mapping.source,
    confidence: mapping.confidence,
    outcome: mapping.outcome,
    ...extras,
  };
}

function redactToolInput(toolInput: Record<string, unknown> | undefined): {
  meta?: Record<string, unknown>;
  redactedCount: number;
  redactionTypes: string[];
} {
  if (!toolInput) return { redactedCount: 0, redactionTypes: [] };
  return applyRedactionToMeta(toolInput);
}

export function normalizeInspectorEvent(input: NormalizeInspectorInput): EvidenceEvent | null {
  const { event } = input;

  switch (event.type) {
    case 'session_start':
      return baseEvent(input, {
        type: 'provider_session_started',
        source: 'provider_hook',
        confidence: 'provider_reported',
      });

    case 'session_end':
      return baseEvent(input, {
        type: 'provider_session_completed',
        source: 'provider_hook',
        confidence: 'provider_reported',
        outcome: 'completed',
      });

    case 'stop_failure':
      return baseEvent(input, {
        type: 'provider_session_failed',
        source: 'provider_hook',
        confidence: 'provider_reported',
        outcome: 'failed',
      });

    case 'pre_tool_use':
      return normalizeToolEvent(input, 'tool_requested');

    case 'tool_use':
      return normalizeToolEvent(input, 'tool_started');

    case 'tool_failure': {
      const redacted = redactToolInput(event.tool_input);
      return baseEvent(
        input,
        {
          type: 'tool_failed',
          source: 'provider_hook',
          confidence: 'provider_reported',
          outcome: 'failed',
        },
        {
          toolName: event.tool_name,
          sanitizedMeta: {
            ...(redacted.meta ?? {}),
            errorCategory: event.error ? 'tool_error' : undefined,
          },
          redactedFieldCount: redacted.redactedCount,
          redactionTypes: redacted.redactionTypes,
        },
      );
    }

    case 'permission_request':
      return baseEvent(
        input,
        {
          type: 'permission_requested',
          source: 'provider_hook',
          confidence: 'provider_reported',
        },
        { toolName: event.tool_name },
      );

    case 'permission_denied':
      return baseEvent(
        input,
        {
          type: 'permission_denied',
          source: 'provider_hook',
          confidence: 'provider_reported',
          outcome: 'denied',
        },
        { toolName: event.tool_name },
      );

    case 'approval_decision': {
      const redactedReason = event.auto_approval?.reason
        ? redactHomePaths(String(redactValue(event.auto_approval.reason).value))
        : undefined;
      return baseEvent(
        input,
        {
          type: 'policy_decision',
          source: 'calder_governance',
          confidence: 'verified',
          outcome: event.auto_approval?.decision,
        },
        {
          toolName: event.tool_name,
          policyDecision: event.auto_approval
            ? {
                policySource: event.auto_approval.policy_source,
                effectiveMode: event.auto_approval.effective_mode,
                operationClass: event.auto_approval.operation_class,
                decision: event.auto_approval.decision,
                reason: redactedReason,
              }
            : undefined,
        },
      );
    }

    case 'user_prompt':
      return baseEvent(
        input,
        {
          type: 'prompt_submitted',
          source: 'provider_hook',
          confidence: 'provider_reported',
        },
        {
          sanitizedMeta: {
            promptLength: event.message?.length ?? event.question?.length ?? undefined,
          },
        },
      );

    case 'file_changed': {
      const filePath = event.file_path ? redactHomePaths(event.file_path) : undefined;
      const redacted = applyRedactionToMeta(filePath ? { filePath } : undefined);
      return baseEvent(
        input,
        {
          type: 'file_change_reported',
          source: 'provider_hook',
          confidence: 'provider_reported',
        },
        {
          sanitizedMeta: redacted.meta,
          sanitizedPaths: filePath ? [filePath] : undefined,
          redactedFieldCount: redacted.redactedCount,
          redactionTypes: redacted.redactionTypes,
        },
      );
    }

    case 'status_update':
      if (!event.cost_snapshot) return null;
      return baseEvent(
        input,
        {
          type: 'cost_snapshot',
          source: 'provider_hook',
          confidence: 'provider_reported',
        },
        {
          sanitizedMeta: {
            totalCostUsd: event.cost_snapshot.total_cost_usd,
            totalDurationMs: event.cost_snapshot.total_duration_ms,
          },
        },
      );

    case 'subagent_start':
      return baseEvent(
        input,
        {
          type: 'subagent_started',
          source: 'provider_hook',
          confidence: 'provider_reported',
        },
        {
          sanitizedMeta: {
            subagentId: event.agent_id,
            agentType: event.agent_type,
          },
        },
      );

    case 'subagent_stop':
      return baseEvent(
        input,
        {
          type: 'subagent_completed',
          source: 'provider_hook',
          confidence: 'provider_reported',
          outcome: 'completed',
        },
        {
          sanitizedMeta: {
            subagentId: event.agent_id,
            agentType: event.agent_type,
          },
        },
      );

    case 'pre_compact':
      return baseEvent(input, {
        type: 'context_compaction_started',
        source: 'provider_hook',
        confidence: 'provider_reported',
      });

    case 'post_compact':
      return baseEvent(input, {
        type: 'context_compaction_completed',
        source: 'provider_hook',
        confidence: 'provider_reported',
        outcome: 'completed',
      });

    default:
      return null;
  }
}

function normalizeToolEvent(
  input: NormalizeInspectorInput,
  type: 'tool_requested' | 'tool_started',
): EvidenceEvent {
  const { event } = input;
  const redacted = redactToolInput(event.tool_input);
  return baseEvent(
    input,
    {
      type,
      source: 'provider_hook',
      confidence: 'provider_reported',
    },
    {
      toolName: event.tool_name,
      sanitizedMeta: redacted.meta,
      redactedFieldCount: redacted.redactedCount,
      redactionTypes: redacted.redactionTypes,
    },
  );
}

export function createPtyStartedEvent(params: {
  sessionId: string;
  evidenceRunId: string;
  providerId: string;
  projectId: string;
  seq: number;
  projectPath?: string;
}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: randomUUID(),
    evidenceRunId: params.evidenceRunId,
    calderSessionId: params.sessionId,
    providerId: params.providerId,
    projectId: params.projectId,
    type: 'pty_started',
    providerEventName: 'pty_started',
    timestamp: Date.now(),
    seq: params.seq,
    source: 'calder_pty',
    confidence: 'verified',
    sanitizedMeta: params.projectPath
      ? { projectPath: redactHomePaths(params.projectPath) }
      : undefined,
  };
}

export function createPtyExitedEvent(
  params: {
    sessionId: string;
    evidenceRunId: string;
    providerId: string;
    projectId: string;
    seq: number;
  },
  exitCode?: number,
  signal?: number | string,
): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: randomUUID(),
    evidenceRunId: params.evidenceRunId,
    calderSessionId: params.sessionId,
    providerId: params.providerId,
    projectId: params.projectId,
    type: 'pty_exited',
    providerEventName: 'pty_exited',
    timestamp: Date.now(),
    seq: params.seq,
    source: 'calder_pty',
    confidence: 'verified',
    outcome: exitCode === 0 ? 'completed' : 'exited',
    sanitizedMeta: {
      exitCode,
      signal: signal !== undefined ? String(signal) : undefined,
    },
  };
}
