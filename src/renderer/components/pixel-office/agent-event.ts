import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { mapToolNameToPixelState } from '../pixel-agent/provider-pixel.js';
import { resolvePixelVisualState } from '../pixel-agent/visual-resolver.js';
import { SUBAGENT_WINDOW_MS } from './types.js';

/** Canonical office activity kinds (pixel-agents vocabulary). */
export type AgentEventKind =
  | 'sessionStart'
  | 'sessionEnd'
  | 'toolStart'
  | 'toolEnd'
  | 'turnEnd'
  | 'permissionRequest'
  | 'subagentStart'
  | 'subagentEnd'
  | 'progress';

export interface AgentEvent {
  kind: AgentEventKind;
  sessionId: string;
  timestamp: number;
  toolName?: string;
  subagentId?: string;
}

export function evidenceEventToAgentEvent(event: EvidenceEvent): AgentEvent | null {
  const base = {
    sessionId: event.calderSessionId,
    timestamp: event.timestamp,
    toolName: event.toolName,
    subagentId:
      event.subagentId ??
      (typeof event.sanitizedMeta?.subagentId === 'string'
        ? event.sanitizedMeta.subagentId
        : undefined),
  };
  switch (event.type) {
    case 'provider_session_started':
    case 'pty_started':
    case 'evidence_run_started':
      return { ...base, kind: 'sessionStart' };
    case 'provider_session_completed':
    case 'session_completed':
    case 'pty_exited':
      return { ...base, kind: 'sessionEnd' };
    case 'tool_requested':
    case 'tool_started':
      return { ...base, kind: 'toolStart' };
    case 'tool_completed':
      return { ...base, kind: 'toolEnd' };
    case 'permission_requested':
      return { ...base, kind: 'permissionRequest' };
    case 'subagent_started':
      return { ...base, kind: 'subagentStart' };
    case 'subagent_completed':
      return { ...base, kind: 'subagentEnd' };
    case 'prompt_submitted':
      return { ...base, kind: 'turnEnd' };
    case 'cost_snapshot':
    case 'context_compaction_started':
    case 'context_compaction_completed':
      return { ...base, kind: 'progress' };
    default:
      return null;
  }
}

export function evidenceTailToAgentSignals(
  _sessionId: string,
  events: EvidenceEvent[],
): {
  isActive: boolean;
  toolName: string | null;
  isReading: boolean;
  bubble: 'none' | 'permission' | 'done';
} {
  const state = resolvePixelVisualState(events);
  const lastTool = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === 'tool_started' ||
        event.type === 'tool_requested' ||
        event.type === 'tool_completed',
    );
  const toolName = lastTool?.toolName ?? null;
  const mapped = toolName ? mapToolNameToPixelState(toolName, lastTool?.sanitizedMeta) : null;
  const isReading =
    mapped === 'reading_files' ||
    mapped === 'searching_code' ||
    mapped === 'reading_project' ||
    mapped === 'researching_web';

  if (state === 'waiting_for_approval') {
    return { isActive: false, toolName, isReading: false, bubble: 'permission' };
  }
  if (state === 'completed') {
    return { isActive: false, toolName, isReading: false, bubble: 'done' };
  }
  if (state === 'idle' || state === 'failed' || state === 'blocked') {
    return { isActive: false, toolName, isReading: false, bubble: 'none' };
  }
  return {
    isActive: true,
    toolName,
    isReading,
    bubble: 'none',
  };
}

export function formatActivityLabel(toolName: string | null, isActive: boolean): string {
  if (!isActive) return '';
  if (!toolName) return 'Working';
  return toolName.slice(0, 24);
}

function subagentKey(event: EvidenceEvent): string {
  if (event.subagentId) return event.subagentId;
  if (typeof event.sanitizedMeta?.subagentId === 'string') {
    return event.sanitizedMeta.subagentId;
  }
  return event.eventId;
}

/** Active unnamed subtasks for a parent session (max 3 for office orbit). */
export function listActiveSubagentIds(events: EvidenceEvent[], now = Date.now()): string[] {
  const open = new Set<string>();
  const anonymous: string[] = [];
  for (const event of events) {
    if (now - event.timestamp > SUBAGENT_WINDOW_MS) continue;
    const explicit = Boolean(
      event.subagentId ||
      (typeof event.sanitizedMeta?.subagentId === 'string' && event.sanitizedMeta.subagentId),
    );
    if (event.type === 'subagent_started') {
      const key = subagentKey(event);
      open.add(key);
      if (!explicit) anonymous.push(key);
    }
    if (event.type === 'subagent_completed') {
      if (explicit) open.delete(subagentKey(event));
      else if (anonymous.length > 0) open.delete(anonymous.shift()!);
    }
  }
  return [...open].slice(0, 3);
}
