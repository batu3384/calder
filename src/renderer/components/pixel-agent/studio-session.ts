import { appState } from '../../state.js';

/** True when the given CLI session is the project's active (foreground) session. */
export function isActiveCliSessionForeground(sessionId: string): boolean {
  const activeId = appState.activeProject?.activeSessionId;
  if (!activeId) return false;
  return activeId === sessionId;
}

/** @deprecated Use isActiveCliSessionForeground with an explicit session id. */
export function isInspectedSessionForeground(): boolean {
  const activeId = appState.activeProject?.activeSessionId;
  return Boolean(activeId);
}
