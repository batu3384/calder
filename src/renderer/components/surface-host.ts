import type { ProjectRecord } from '../state.js';
import { attachBrowserTabToContainer, showBrowserTabPane } from './browser-tab-pane.js';
import { attachCliSurfacePane, showCliSurfacePane } from './cli-surface/pane.js';

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

export function renderSurfaceHost(project: ProjectRecord, container: HTMLElement): void {
  if (project.surface?.active && project.surface.kind === 'cli') {
    attachCliSurfacePane(project.id, container);
    showCliSurfacePane(project.id);
    return;
  }

  const sessionId = resolveBrowserSurfaceSessionId(project);
  if (!sessionId) return;

  attachBrowserTabToContainer(sessionId, container);
  showBrowserTabPane(sessionId, true);
}
