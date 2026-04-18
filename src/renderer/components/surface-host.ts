import type { ProjectRecord } from '../state.js';
import { attachBrowserTabToContainer, showBrowserTabPane } from './browser-tab-pane.js';
import { attachCliSurfacePane, showCliSurfacePane } from './cli-surface/pane.js';
import { attachMobileSurfacePane, showMobileSurfacePane } from './mobile-surface/pane.js';

function resolveBrowserSurfaceSessionId(project: ProjectRecord): string | undefined {
  const surfaceSessionId = project.surface?.web?.sessionId;
  if (surfaceSessionId) {
    const surfaceSession = project.sessions.find(
      (session) => session.id === surfaceSessionId && session.type === 'browser-tab',
    );
    if (surfaceSession) return surfaceSession.id;
  }
  return [...project.sessions].reverse().find((session) => session.type === 'browser-tab')?.id;
}

function isCliSurfaceFocused(project: ProjectRecord): boolean {
  return Boolean(
    project.surface?.active
    && project.surface.kind === 'cli'
    && project.surface.tabFocus === 'cli',
  );
}

function isMobileSurfaceFocused(project: ProjectRecord): boolean {
  return Boolean(
    project.surface?.active
    && project.surface.kind === 'mobile'
    && project.surface.tabFocus === 'mobile',
  );
}

export function hasPinnedSurfaceFocus(project: ProjectRecord): boolean {
  return isCliSurfaceFocused(project) || isMobileSurfaceFocused(project);
}

export function renderSurfaceHost(project: ProjectRecord, container: HTMLElement): void {
  if (isCliSurfaceFocused(project)) {
    attachCliSurfacePane(project.id, container);
    showCliSurfacePane(project.id);
    return;
  }

  if (isMobileSurfaceFocused(project)) {
    attachMobileSurfacePane(project.id, container);
    showMobileSurfacePane(project.id);
    return;
  }

  const sessionId = resolveBrowserSurfaceSessionId(project);
  if (!sessionId) return;

  attachBrowserTabToContainer(sessionId, container);
  showBrowserTabPane(sessionId, true);
}
