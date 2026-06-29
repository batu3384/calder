import { isConnected,isSharing } from '../../sharing/peer-host.js';
import { appState, type ProjectRecord, type SessionRecord } from '../../state.js';
import { buildShareDialogMobilePresence } from '../share-dialog/share-dialog.js';

function getActiveCliSession(project: ProjectRecord): SessionRecord | null {
  const activeSession = project.sessions.find((session) => session.id === project.activeSessionId) ?? null;
  if (!activeSession) return null;
  const isCliSession = !activeSession.type || activeSession.type === 'claude';
  return isCliSession ? activeSession : null;
}

export function getPreferredCliSession(project: ProjectRecord): SessionRecord | null {
  const cliSessions = project.sessions.filter((session) => !session.type || session.type === 'claude');
  const connectedSession = cliSessions.find((session) => isConnected(session.id));
  if (connectedSession) return connectedSession;

  const sharingSession = cliSessions.find((session) => isSharing(session.id));
  if (sharingSession) return sharingSession;

  const activeCliSession = getActiveCliSession(project);
  if (activeCliSession) return activeCliSession;
  return cliSessions[0] ?? null;
}

export function syncMobileControlButton(
  btnMobileControl: HTMLButtonElement | null,
  mobileControlPresenceEl: HTMLSpanElement | null,
): void {
  if (!btnMobileControl) return;
  const language = appState.preferences.language === 'tr' ? 'tr' : 'en';
  const uiCopy = language === 'tr'
    ? {
        createCliSessionHint: 'Henüz CLI oturumu yok. Bir tane oluşturup güvenli devri başlatmak için tıklayın',
        openSecureHandoffFor: (sessionName: string) => `"${sessionName}" için güvenli devir panelini aç`,
        openPanelSuffix: 'Paneli aç.',
      }
    : {
        createCliSessionHint: 'No CLI session yet. Click to create one and start secure handoff',
        openSecureHandoffFor: (sessionName: string) => `Open secure handoff panel for "${sessionName}"`,
        openPanelSuffix: 'Open panel.',
      };
  const project = appState.activeProject;
  if (!project) {
    btnMobileControl.hidden = true;
    btnMobileControl.disabled = true;
    btnMobileControl.classList.remove('is-sharing', 'is-connected');
    btnMobileControl.removeAttribute('data-connection-state');
    if (mobileControlPresenceEl) {
      mobileControlPresenceEl.hidden = true;
      mobileControlPresenceEl.textContent = '';
      mobileControlPresenceEl.removeAttribute('data-connection-state');
      mobileControlPresenceEl.removeAttribute('title');
    }
    return;
  }

  const targetCliSession = getPreferredCliSession(project);
  btnMobileControl.hidden = false;
  if (!targetCliSession) {
    btnMobileControl.disabled = false;
    btnMobileControl.classList.remove('is-sharing', 'is-connected');
    btnMobileControl.dataset.connectionState = 'idle';
    btnMobileControl.setAttribute('aria-pressed', 'false');
    btnMobileControl.title = uiCopy.createCliSessionHint;
    btnMobileControl.setAttribute('aria-label', uiCopy.createCliSessionHint);
    if (mobileControlPresenceEl) {
      mobileControlPresenceEl.hidden = true;
      mobileControlPresenceEl.textContent = '';
      mobileControlPresenceEl.removeAttribute('data-connection-state');
      mobileControlPresenceEl.removeAttribute('title');
    }
    return;
  }

  const sharing = isSharing(targetCliSession.id);
  const connected = sharing && isConnected(targetCliSession.id);
  const presence = buildShareDialogMobilePresence({
    sessionId: targetCliSession.id,
    language: appState.preferences.language,
    resolveSessionName: (sessionId, fallbackSessionId) =>
      project.sessions.find((session) => session.id === sessionId)?.name ?? fallbackSessionId,
    nowMs: Date.now(),
  });
  btnMobileControl.disabled = false;
  btnMobileControl.classList.toggle('is-sharing', sharing);
  btnMobileControl.classList.toggle('is-connected', connected);
  btnMobileControl.dataset.connectionState = connected ? 'connected' : sharing ? 'waiting' : 'idle';
  btnMobileControl.setAttribute('aria-pressed', sharing ? 'true' : 'false');
  const connectedTitle = presence.metaText
    ? `${presence.summaryText} · ${presence.metaText} ${uiCopy.openPanelSuffix}`
    : `${presence.summaryText} ${uiCopy.openPanelSuffix}`;
  const waitingTitle = presence.metaText
    ? `${presence.summaryText} · ${presence.metaText} ${uiCopy.openPanelSuffix}`
    : `${presence.summaryText} ${uiCopy.openPanelSuffix}`;
  const idleTitle = `${presence.summaryText} · ${uiCopy.openSecureHandoffFor(targetCliSession.name)}`;
  btnMobileControl.title = connected
    ? connectedTitle
    : sharing
      ? waitingTitle
      : idleTitle;
  btnMobileControl.setAttribute(
    'aria-label',
    connected
      ? connectedTitle
      : sharing
        ? waitingTitle
        : idleTitle,
  );

  if (mobileControlPresenceEl) {
    if (!sharing) {
      mobileControlPresenceEl.hidden = true;
      mobileControlPresenceEl.textContent = '';
      mobileControlPresenceEl.removeAttribute('data-connection-state');
      mobileControlPresenceEl.removeAttribute('title');
    } else {
      mobileControlPresenceEl.hidden = false;
      mobileControlPresenceEl.dataset.connectionState = connected ? 'connected' : 'waiting';
      mobileControlPresenceEl.textContent = presence.stateLabel;
      mobileControlPresenceEl.title = connected
        ? connectedTitle
        : waitingTitle;
    }
  }
}
