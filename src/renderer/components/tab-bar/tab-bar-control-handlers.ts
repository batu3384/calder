import type { ProjectRecord } from '../../state.js';
import { getProjectSurface, updateProjectSurface } from './tab-bar-surface-state.js';

export function activateLiveViewSurface(
  project: ProjectRecord,
  onMissingBrowserSession: (projectId: string) => void,
): void {
  const existingBrowser = [...project.sessions]
    .reverse()
    .find((session) => session.type === 'browser-tab');
  if (!existingBrowser) {
    onMissingBrowserSession(project.id);
    return;
  }

  const surface = getProjectSurface(project);
  updateProjectSurface(project, {
    ...surface,
    kind: 'web',
    active: true,
    web: {
      sessionId: existingBrowser.id,
      url: existingBrowser.browserTabUrl,
      history:
        surface.web?.history ??
        (existingBrowser.browserTabUrl ? [existingBrowser.browserTabUrl] : []),
    },
  });
}
