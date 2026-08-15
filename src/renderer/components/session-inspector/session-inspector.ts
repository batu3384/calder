/**
 * Pixel Office session rail API. Legacy `*Inspector*` names are deprecated aliases below.
 */
import { appState } from '../../state.js';
import { isCliSessionRecord } from '../../state-project-surface.js';
import {
  isPixelOfficeOpen,
  openPixelOffice,
  setPixelOfficeOpen,
  togglePixelOffice,
} from '../pixel-office/mount-pixel-office.js';

export function isPixelOfficeSessionRailOpen(): boolean {
  return isPixelOfficeOpen();
}

export function getPixelOfficeSessionId(): string | null {
  if (!isPixelOfficeOpen()) return null;
  const session = appState.activeSession;
  if (!session || !isCliSessionRecord(session)) return null;
  return session.id;
}

export function openPixelOfficeForSession(sessionId: string): void {
  const session = appState.activeProject?.sessions.find((entry) => entry.id === sessionId);
  if (!session || !isCliSessionRecord(session)) return;
  const project = appState.activeProject;
  if (project?.sessions.some((entry) => entry.id === sessionId)) {
    appState.setActiveSession(project.id, sessionId);
  }
  openPixelOffice();
}

export function focusPixelOfficeSession(sessionId: string): void {
  openPixelOfficeForSession(sessionId);
}

export function closePixelOfficeSessionRail(): void {
  setPixelOfficeOpen(false);
}

export function togglePixelOfficeSessionRail(): void {
  togglePixelOffice();
}

export function focusPixelOfficeEvidenceTab(): void {
  openPixelOffice();
}

/** @deprecated Use `isPixelOfficeSessionRailOpen`. */
export const isInspectorOpen = isPixelOfficeSessionRailOpen;
/** @deprecated Use `getPixelOfficeSessionId`. */
export const getInspectedSessionId = getPixelOfficeSessionId;
/** @deprecated Use `openPixelOfficeForSession`. */
export const openInspector = openPixelOfficeForSession;
/** @deprecated Use `focusPixelOfficeSession`. */
export const focusInspectorSession = focusPixelOfficeSession;
/** @deprecated Use `closePixelOfficeSessionRail`. */
export const closeInspector = closePixelOfficeSessionRail;
/** @deprecated Use `togglePixelOfficeSessionRail`. */
export const toggleInspector = togglePixelOfficeSessionRail;
/** @deprecated Use `focusPixelOfficeEvidenceTab`. */
export const focusContextPixelTab = focusPixelOfficeEvidenceTab;

export function setSessionInspectorRelayoutCallback(_callback: (() => void) | null): void {
  // No terminal dock panel to relayout.
}

/** @deprecated Mount lives in `initPixelOffice()`. */
export function initSessionInspector(): void {}
