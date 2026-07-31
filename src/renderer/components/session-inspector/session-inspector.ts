/**
 * Legacy Session Inspector API — now opens Pixel Office.
 * Evidence capture / session-inspector-state remain for hooks.
 */
import { appState } from '../../state.js';
import { isCliSessionRecord } from '../../state-project-surface.js';
import { openPixelOffice, togglePixelOffice } from '../pixel-office/mount-pixel-office.js';

export function isInspectorOpen(): boolean {
  return false;
}

export function getInspectedSessionId(): string | null {
  return null;
}

export function setSessionInspectorRelayoutCallback(_callback: (() => void) | null): void {
  // No terminal dock panel to relayout.
}

function focusOfficeForSession(sessionId: string): void {
  const project = appState.activeProject;
  if (project?.sessions.some((session) => session.id === sessionId)) {
    appState.setActiveSession(project.id, sessionId);
  }
  openPixelOffice();
}

export function openInspector(sessionId: string, _options?: { mode?: 'toggle' | 'focus' }): void {
  const session = appState.activeProject?.sessions.find((s) => s.id === sessionId);
  if (!session || !isCliSessionRecord(session)) return;
  focusOfficeForSession(sessionId);
}

export function focusInspectorSession(sessionId: string): void {
  openInspector(sessionId, { mode: 'focus' });
}

export function closeInspector(): void {
  // Pixel Office has its own close control.
}

export function toggleInspector(): void {
  togglePixelOffice();
}

export function initSessionInspector(): void {
  // Mount lives in initPixelOffice(); shim retained for callers.
}

export function focusContextPixelTab(): void {
  openPixelOffice();
}
