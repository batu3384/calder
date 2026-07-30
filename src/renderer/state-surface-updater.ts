import type { ProjectRecord } from '../shared/types/project-state.js';
import type { ProjectSurfaceRecord } from '../shared/types/project-surface.js';
import { normalizeProjectSurface } from './state-normalizers.js';
import { repairProjectSurface } from './state-project-surface.js';

interface ActiveSessionUpdateResult {
  surfaceChanged: boolean;
}

export function setActiveProjectSession(
  project: ProjectRecord,
  sessionId: string,
): ActiveSessionUpdateResult {
  project.activeSessionId = sessionId;
  const activeSession = project.sessions.find((session) => session.id === sessionId);
  let surfaceChanged = false;

  if (activeSession?.type === 'browser-tab') {
    project.surface = normalizeProjectSurface(project);
    project.surface.kind = 'web';
    project.surface.active = true;
    project.surface.web = project.surface.web ?? { history: [] };
    project.surface.web.sessionId = activeSession.id;
    project.surface.web.url = activeSession.browserTabUrl;
    if (activeSession.browserTabUrl) {
      project.surface.web.history = Array.from(
        new Set([...(project.surface.web.history ?? []), activeSession.browserTabUrl]),
      );
    }
    surfaceChanged = true;
  }

  return { surfaceChanged };
}

export function applyProjectSurface(project: ProjectRecord, surface: ProjectSurfaceRecord): void {
  project.surface = {
    ...surface,
    kind: 'web',
    web: surface.web
      ? {
          ...surface.web,
          history: surface.web.history ? [...surface.web.history] : [],
        }
      : { history: [] },
  };
  repairProjectSurface(project);
}
