import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { mapToolNameToPixelState } from './provider-pixel.js';

export type PixelVisualState =
  | 'idle'
  | 'preparing'
  | 'unknown_working'
  | 'reading_project'
  | 'searching_code'
  | 'reading_files'
  | 'researching_web'
  | 'browsing'
  | 'using_mcp'
  | 'git_ops'
  | 'compacting'
  | 'editing_code'
  | 'running_command'
  | 'running_tests'
  | 'building'
  | 'waiting_for_approval'
  | 'blocked'
  | 'failed'
  | 'completed';

export const STALE_ACTIVE_MS = 5 * 60 * 1000;

const INTERRUPT_STATES = new Set<PixelVisualState>(['waiting_for_approval', 'blocked', 'failed']);

function eventToState(event: EvidenceEvent): PixelVisualState | null {
  switch (event.type) {
    case 'pty_started':
    case 'evidence_run_started':
      return 'preparing';
    case 'permission_requested':
      return 'waiting_for_approval';
    case 'operation_blocked':
    case 'permission_denied':
      return 'blocked';
    case 'policy_decision':
      return event.outcome === 'block' || event.policyDecision?.decision === 'block'
        ? 'blocked'
        : null;
    case 'tool_failed':
    case 'provider_session_failed':
    case 'session_failed':
      return 'failed';
    case 'provider_session_completed':
    case 'session_completed':
    case 'pty_exited':
      return event.outcome === 'completed' ? 'completed' : null;
    case 'context_compaction_started':
      return 'compacting';
    case 'git_change_observed':
    case 'git_state_captured':
    case 'file_change_reported':
      return 'git_ops';
    case 'tool_started':
    case 'tool_requested':
      return mapToolNameToPixelState(event.toolName ?? '', event.sanitizedMeta);
    case 'prompt_submitted':
    case 'subagent_started':
      return 'unknown_working';
    default:
      return null;
  }
}

function isStale(timestamp: number, now: number): boolean {
  return now - timestamp > STALE_ACTIVE_MS;
}

/**
 * Chronological resolver: later clearing events override sticky interrupts.
 * permission_approved clears waiting; later work/completion clears blocked/failed.
 */
export function resolvePixelVisualState(
  events: EvidenceEvent[],
  now = Date.now(),
): PixelVisualState {
  if (events.length === 0) return 'idle';

  const ordered = [...events].sort((a, b) => a.seq - b.seq || a.timestamp - b.timestamp);
  let state: PixelVisualState = 'idle';
  let stateAt = 0;

  for (const event of ordered) {
    if (event.type === 'permission_approved') {
      if (state === 'waiting_for_approval') {
        state = 'unknown_working';
        stateAt = event.timestamp;
      }
      continue;
    }

    if (event.type === 'context_compaction_completed') {
      if (state === 'compacting') {
        state = 'unknown_working';
        stateAt = event.timestamp;
      }
      continue;
    }

    const next = eventToState(event);
    if (!next) continue;

    if (next === 'waiting_for_approval') {
      state = 'waiting_for_approval';
      stateAt = event.timestamp;
      continue;
    }

    if (next === 'blocked' || next === 'failed') {
      state = next;
      stateAt = event.timestamp;
      continue;
    }

    if (next === 'completed') {
      state = 'completed';
      stateAt = event.timestamp;
      continue;
    }

    // Active / preparing work cannot interrupt an unresolved approval gate.
    if (state === 'waiting_for_approval') continue;

    state = next;
    stateAt = event.timestamp;
  }

  if (INTERRUPT_STATES.has(state) && isStale(stateAt, now)) {
    return 'idle';
  }
  if (
    !INTERRUPT_STATES.has(state) &&
    state !== 'completed' &&
    state !== 'idle' &&
    isStale(stateAt, now)
  ) {
    return 'idle';
  }

  return state;
}

export function pixelStateLabel(state: PixelVisualState): string {
  switch (state) {
    case 'preparing':
      return 'Pixel state: Preparing';
    case 'unknown_working':
      return 'Pixel state: Waiting for structured activity';
    case 'reading_project':
      return 'Pixel state: Reading project';
    case 'searching_code':
      return 'Pixel state: Searching code';
    case 'reading_files':
      return 'Pixel state: Reading files';
    case 'researching_web':
      return 'Pixel state: Researching the web';
    case 'browsing':
      return 'Pixel state: Browsing';
    case 'using_mcp':
      return 'Pixel state: Using MCP';
    case 'git_ops':
      return 'Pixel state: Git activity';
    case 'compacting':
      return 'Pixel state: Compacting context';
    case 'editing_code':
      return 'Pixel state: Editing code';
    case 'running_command':
      return 'Pixel state: Running command';
    case 'running_tests':
      return 'Pixel state: Running tests';
    case 'building':
      return 'Pixel state: Building';
    case 'waiting_for_approval':
      return 'Pixel state: Waiting for approval';
    case 'blocked':
      return 'Pixel state: Blocked';
    case 'failed':
      return 'Pixel state: Failed';
    case 'completed':
      return 'Pixel state: Completed';
    default:
      return 'Pixel state: Idle';
  }
}
