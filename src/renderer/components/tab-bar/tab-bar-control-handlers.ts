import type { ProjectRecord, SessionRecord } from '../../state.js';
import { showShareDialog } from '../share-dialog/share-dialog.js';
import { getPreferredCliSession, syncMobileControlButton } from './tab-bar-mobile-control.js';
import { getProjectSurface, updateProjectSurface } from './tab-bar-surface-state.js';

interface HandleMobileControlClickOptions {
  project: ProjectRecord | null;
  btnMobileControl: HTMLButtonElement | null;
  mobileControlPresenceEl: HTMLSpanElement | null;
  promptNewSession: (onCreated?: (session: SessionRecord) => void) => Promise<void>;
}

export function handleMobileControlClick(options: HandleMobileControlClickOptions): void {
  const { project, btnMobileControl, mobileControlPresenceEl, promptNewSession } = options;
  if (!project) return;

  const targetCliSession = getPreferredCliSession(project);
  if (!targetCliSession) {
    void promptNewSession((session) => {
      showShareDialog(session.id);
      syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
    });
    return;
  }

  showShareDialog(targetCliSession.id);
  syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
}

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

export function activateMobileSurface(project: ProjectRecord): void {
  const surface = getProjectSurface(project);
  updateProjectSurface(project, {
    ...surface,
    kind: 'mobile',
    active: true,
    tabFocus: 'mobile',
  });
}
