/**
 * Session Inspector dock panel removed — these shims open Context Inspector Pixel.
 * Evidence capture / session-inspector-state remain for hooks.
 */
import { appState } from '../../state.js';
import { isCliSessionRecord } from '../../state-project-surface.js';
import { focusContextPixelTab, toggleContextInspector } from '../context-inspector.js';

export function isInspectorOpen(): boolean {
  return false;
}

export function getInspectedSessionId(): string | null {
  return null;
}

export function setSessionInspectorRelayoutCallback(_callback: (() => void) | null): void {
  // No terminal dock panel to relayout.
}

function focusPixelForSession(sessionId: string): void {
  const project = appState.activeProject;
  if (project?.sessions.some((session) => session.id === sessionId)) {
    appState.setActiveSession(project.id, sessionId);
  }
  focusContextPixelTab();
}

export function openInspector(sessionId: string, _options?: { mode?: 'toggle' | 'focus' }): void {
  const session = appState.activeProject?.sessions.find((s) => s.id === sessionId);
  if (!session || !isCliSessionRecord(session)) return;
  focusPixelForSession(sessionId);
}

export function focusInspectorSession(sessionId: string): void {
  openInspector(sessionId, { mode: 'focus' });
}

export function closeInspector(): void {
  // Pixel lives in Context Inspector; closing the old dock is a no-op.
}

export function toggleInspector(): void {
  const project = appState.activeProject;
  if (!project) {
    toggleContextInspector();
    return;
  }
  const session = project.activeSessionId
    ? project.sessions.find((s) => s.id === project.activeSessionId)
    : undefined;
  if (session && isCliSessionRecord(session)) {
    focusContextPixelTab();
    return;
  }
  const cli = project.sessions.find((candidate) => isCliSessionRecord(candidate));
  if (cli) {
    focusPixelForSession(cli.id);
    return;
  }
  focusContextPixelTab();
}

export function initSessionInspector(): void {
  // Panel lifecycle removed; Context Inspector owns Pixel.
}
