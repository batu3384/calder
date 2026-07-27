import type { ProjectRecord } from '../shared/types/project-state.js';
import type { ProjectSurfaceRecord } from '../shared/types/project-surface.js';
import { normalizeProjectSurface, stripTransientRuntimeFields } from './state-normalizers.js';
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

  if (project.surface?.kind === 'cli' && project.surface.tabFocus === 'cli') {
    project.surface = normalizeProjectSurface(project);
    project.surface.tabFocus = 'session';
    surfaceChanged = true;
  }

  if (activeSession?.type === 'browser-tab') {
    project.surface = normalizeProjectSurface(project);
    project.surface.kind = 'web';
    project.surface.active = true;
    project.surface.tabFocus = 'session';
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
  const kind = surface.kind === 'web' || surface.kind === 'cli' ? surface.kind : 'web';
  const tabFocus =
    kind === 'cli' ? (surface.tabFocus ?? (surface.active ? 'cli' : 'session')) : 'session';
  const tabPlacement = surface.tabPlacement === 'start' ? 'start' : 'end';
  const tabOrder: Array<'cli'> = ['cli'];

  project.surface = {
    ...surface,
    kind,
    tabFocus,
    tabPlacement,
    tabOrder,
    web: surface.web
      ? {
          ...surface.web,
          history: surface.web.history ? [...surface.web.history] : [],
        }
      : { history: [] },
    cli: surface.cli
      ? {
          ...surface.cli,
          profiles: [...surface.cli.profiles],
          runtime: surface.cli.runtime
            ? stripTransientRuntimeFields(surface.cli.runtime)
            : undefined,
        }
      : { profiles: [], runtime: { status: 'idle' } },
  };
  repairProjectSurface(project);
}

export function focusCliProjectSurface(project: ProjectRecord): boolean {
  project.surface = normalizeProjectSurface(project);
  if (project.surface.kind !== 'cli') return false;
  project.surface.active = true;
  project.surface.tabFocus = 'cli';
  return true;
}

export function closeCliProjectSurface(project: ProjectRecord): boolean {
  project.surface = normalizeProjectSurface(project);
  if (project.surface.kind !== 'cli') return false;
  project.surface.active = false;
  project.surface.tabFocus = 'session';
  return true;
}
