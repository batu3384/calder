import type { InspectorEventType } from '../shared/types/session';
import { CLAUDE_EVENT_HOOK_TEMPLATE } from './claude-event-hook-template-source';

const STATUS_DIR_PLACEHOLDER = '__CALDER_STATUS_DIR__';
const EVENT_TYPE_PLACEHOLDER = '__CALDER_EVENT_TYPE__';
const HOOK_EVENT_PLACEHOLDER = '__CALDER_HOOK_EVENT__';

export function buildClaudeEventHookPython(
  hookEvent: string,
  eventType: InspectorEventType,
  statusDir: string,
): string {
  return CLAUDE_EVENT_HOOK_TEMPLATE.split(STATUS_DIR_PLACEHOLDER)
    .join(statusDir)
    .split(EVENT_TYPE_PLACEHOLDER)
    .join(eventType)
    .split(HOOK_EVENT_PLACEHOLDER)
    .join(hookEvent);
}
