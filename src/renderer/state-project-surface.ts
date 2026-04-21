import type { ProjectRecord, SessionRecord } from '../shared/types.js';
import { normalizeProjectSurface } from './state-normalizers.js';

export function isCliSessionRecord(session: SessionRecord): boolean {
  return !session.type || session.type === 'claude';
}

export function findProjectSession(project: ProjectRecord, sessionId: string): SessionRecord | undefined {
  return project.sessions.find((session) => session.id === sessionId);
}

export function findActiveCliSession(
  project: ProjectRecord,
  excludingSessionId?: string,
): SessionRecord | undefined {
  const activeSession = project.activeSessionId
    ? findProjectSession(project, project.activeSessionId)
    : undefined;
  if (activeSession && activeSession.id !== excludingSessionId && isCliSessionRecord(activeSession)) {
    return activeSession;
  }
  return undefined;
}

export function resolveSurfaceTargetFromProject(
  project: ProjectRecord,
  options?: { allowActiveFallback?: boolean },
): SessionRecord | undefined {
  const allowActiveFallback = options?.allowActiveFallback ?? true;
  const storedTargetId = project.surface?.targetSessionId;
  if (storedTargetId) {
    const storedTarget = findProjectSession(project, storedTargetId);
    if (storedTarget && isCliSessionRecord(storedTarget)) {
      return storedTarget;
    }
  }

  if (!allowActiveFallback) {
    return undefined;
  }

  return findActiveCliSession(project);
}

export function repairProjectSurface(project: ProjectRecord): boolean {
  const nextSurface = normalizeProjectSurface(project);
  const resolvedTarget = resolveSurfaceTargetFromProject({ ...project, surface: nextSurface });

  if (resolvedTarget) {
    nextSurface.targetSessionId = resolvedTarget.id;
  } else {
    delete nextSurface.targetSessionId;
  }

  for (const session of project.sessions) {
    if (session.type !== 'browser-tab') continue;
    if (resolvedTarget?.id !== session.browserTargetSessionId) {
      if (resolvedTarget) {
        session.browserTargetSessionId = resolvedTarget.id;
      } else {
        delete session.browserTargetSessionId;
      }
    }
    if (session.id === nextSurface.web?.sessionId) {
      nextSurface.web = {
        sessionId: session.id,
        url: session.browserTabUrl,
        history: nextSurface.web?.history ?? [],
      };
    }
  }

  const changed = JSON.stringify(project.surface ?? null) !== JSON.stringify(nextSurface);
  project.surface = nextSurface;
  return changed;
}
