import { appState } from '../../state.js';
import { inspectorState } from '../session-inspector/session-inspector-state-ui.js';

export function isInspectedSessionForeground(): boolean {
  const inspectedId = inspectorState.inspectedSessionId;
  if (!inspectedId) return false;
  const activeId = appState.activeProject?.activeSessionId;
  // No active session → treat as background (pause animations).
  if (!activeId) return false;
  return activeId === inspectedId;
}
