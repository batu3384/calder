import { appState } from '../../state.js';
import { isCliSessionRecord } from '../../state-project-surface.js';

/** Open CLI sessions in the active project (Pixel Office roster source). */
export function listOpenCliSessions() {
  const project = appState.activeProject;
  if (!project) return [];
  return project.sessions.filter(isCliSessionRecord);
}
