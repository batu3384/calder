import type { EvidenceEvent } from '../../../shared/types-evidence.js';

export type PixelVisualState =
  | 'idle'
  | 'preparing'
  | 'unknown_working'
  | 'reading_project'
  | 'editing_code'
  | 'running_command'
  | 'running_tests'
  | 'building'
  | 'waiting_for_approval'
  | 'blocked'
  | 'failed'
  | 'completed';

const STATE_PRIORITY: Record<PixelVisualState, number> = {
  waiting_for_approval: 100,
  blocked: 95,
  failed: 90,
  running_tests: 55,
  building: 54,
  running_command: 50,
  editing_code: 45,
  reading_project: 40,
  preparing: 25,
  unknown_working: 20,
  completed: 15,
  idle: 10,
};

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
    case 'tool_failed':
    case 'provider_session_failed':
    case 'session_failed':
      return 'failed';
    case 'provider_session_completed':
    case 'session_completed':
    case 'pty_exited':
      return event.outcome === 'completed' ? 'completed' : null;
    case 'tool_started':
    case 'tool_requested': {
      const tool = (event.toolName ?? '').toLowerCase();
      if (/test|vitest|jest|pytest/.test(tool)) return 'running_tests';
      if (/build|compile|webpack|vite|tsc/.test(tool)) return 'building';
      if (/read|grep|glob|search/.test(tool)) return 'reading_project';
      if (/write|edit|strreplace|apply_patch/.test(tool)) return 'editing_code';
      if (/shell|bash|terminal|run/.test(tool)) return 'running_command';
      return 'unknown_working';
    }
    case 'prompt_submitted':
      return 'unknown_working';
    default:
      return null;
  }
}

export function resolvePixelVisualState(events: EvidenceEvent[]): PixelVisualState {
  if (events.length === 0) return 'idle';

  let best: PixelVisualState = 'idle';
  let bestPriority = STATE_PRIORITY.idle;

  for (const event of events) {
    const state = eventToState(event);
    if (!state) continue;
    const priority = STATE_PRIORITY[state];
    if (priority > bestPriority) {
      best = state;
      bestPriority = priority;
    }
  }

  return best;
}

export function pixelStateLabel(state: PixelVisualState): string {
  switch (state) {
    case 'preparing':
      return 'Preparing';
    case 'unknown_working':
      return 'Waiting for structured activity';
    case 'reading_project':
      return 'Reading project';
    case 'editing_code':
      return 'Editing code';
    case 'running_command':
      return 'Running command';
    case 'running_tests':
      return 'Running tests';
    case 'building':
      return 'Building';
    case 'waiting_for_approval':
      return 'Waiting for approval';
    case 'blocked':
      return 'Blocked';
    case 'failed':
      return 'Failed';
    case 'completed':
      return 'Completed';
    default:
      return 'Idle';
  }
}
