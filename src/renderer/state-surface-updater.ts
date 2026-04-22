import type { ProjectRecord, ProjectSurfaceRecord } from '../shared/types/project.js';
import { normalizeProjectSurface, stripTransientRuntimeFields } from './state-normalizers.js';
import { repairProjectSurface } from './state-project-surface.js';

interface ActiveSessionUpdateResult {
  surfaceChanged: boolean;
}

export function setActiveProjectSession(project: ProjectRecord, sessionId: string): ActiveSessionUpdateResult {
  project.activeSessionId = sessionId;
  const activeSession = project.sessions.find((session) => session.id === sessionId);
  let surfaceChanged = false;

  if (
    (project.surface?.kind === 'cli' && project.surface.tabFocus === 'cli')
    || (project.surface?.kind === 'mobile' && project.surface.tabFocus === 'mobile')
  ) {
    project.surface = normalizeProjectSurface(project);
    project.surface.tabFocus = 'session';
    surfaceChanged = true;
  }

  if (activeSession?.type === 'browser-tab') {
    project.surface = normalizeProjectSurface(project);
    const preserveMobileSurface = project.surface.kind === 'mobile' && project.surface.active;
    if (!preserveMobileSurface) {
      project.surface.kind = 'web';
      project.surface.active = true;
    }
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
  const tabFocus = surface.kind === 'cli'
    ? (surface.tabFocus ?? (surface.active ? 'cli' : 'session'))
    : surface.kind === 'mobile'
      ? (surface.tabFocus ?? (surface.active ? 'mobile' : 'session'))
    : 'session';
  const tabPlacement = surface.tabPlacement === 'start' ? 'start' : 'end';
  const tabOrder = Array.isArray(surface.tabOrder)
    ? surface.tabOrder.filter((entry): entry is 'cli' | 'mobile' => entry === 'cli' || entry === 'mobile')
    : [];
  const normalizedTabOrder: Array<'cli' | 'mobile'> = (tabOrder.length === 2 && tabOrder.includes('cli') && tabOrder.includes('mobile'))
    ? tabOrder
    : ['cli', 'mobile'];

  project.surface = {
    ...surface,
    tabFocus,
    tabPlacement,
    tabOrder: normalizedTabOrder,
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
          runtime: surface.cli.runtime ? stripTransientRuntimeFields(surface.cli.runtime) : undefined,
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

export function focusMobileProjectSurface(project: ProjectRecord): boolean {
  project.surface = normalizeProjectSurface(project);
  if (project.surface.kind !== 'mobile') return false;
  project.surface.active = true;
  project.surface.tabFocus = 'mobile';
  return true;
}

export function closeMobileProjectSurface(project: ProjectRecord): boolean {
  project.surface = normalizeProjectSurface(project);
  if (project.surface.kind !== 'mobile') return false;
  project.surface.kind = 'web';
  project.surface.active = false;
  project.surface.tabFocus = 'session';
  return true;
}
