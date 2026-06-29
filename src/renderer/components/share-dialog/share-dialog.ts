// Share dialog — host-side UI for sharing a session via P2P.

import { isConnected,isSharing } from '../../sharing/peer-host.js';
import { endShare } from '../../sharing/share-manager.js';
import { appState } from '../../state.js';
import type { MobileControlApi, SharingConfigApi } from './share-dialog-api.js';
import {
  getShareDialogCopy,
  resolveShareDialogLanguage,
} from './share-dialog-copy.js';
import type { ShareDialogFlowController } from './share-dialog-flow-controller.js';
import { buildShareDialogMobilePresence } from './share-dialog-mobile-presence.js';
import {
  buildShareDialogSections,
  wireShareDialogInteractions,
} from './share-dialog-render-helpers.js';

export type { ShareDialogCopy } from './share-dialog-copy.js';
export type { ShareDialogMobilePresenceCopy, ShareDialogMobilePresenceView } from './share-dialog-mobile-presence.js';
export {
  buildShareDialogMobilePresence,
  formatShareConnectionDuration,
  getShareDialogMobilePresenceCopy,
} from './share-dialog-mobile-presence.js';

let activeOverlay: HTMLElement | null = null;
let pendingShareSessionId: string | null = null;
let activeFlowController: ShareDialogFlowController | null = null;
let mobilePresenceRefreshTimer: ReturnType<typeof setInterval> | null = null;

function getMobileControlApi(): MobileControlApi | null {
  if (typeof window === 'undefined') return null;
  const scopedWindow = window as Window & { calder?: { mobile?: MobileControlApi } };
  return scopedWindow.calder?.mobile ?? null;
}

function getSharingConfigApi(): SharingConfigApi | null {
  if (typeof window === 'undefined') return null;
  const scopedWindow = window as Window & { calder?: { sharing?: SharingConfigApi } };
  return scopedWindow.calder?.sharing ?? null;
}

export function showShareDialog(sessionId: string): void {
  renderShareDialog(sessionId);
}

function renderShareDialog(sessionId: string): void {
  closeShareDialog();

  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  activeOverlay = overlay;

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog modal-surface share-dialog-shell';

  const mobileApi = getMobileControlApi();
  const sharingConfigApi = getSharingConfigApi();
  const uiLanguage = resolveShareDialogLanguage(appState.preferences.language);
  const copy = getShareDialogCopy(uiLanguage);

  const hero = document.createElement('div');
  hero.className = 'share-dialog-hero';

  const kicker = document.createElement('div');
  kicker.className = 'share-dialog-kicker shell-kicker';
  kicker.textContent = copy.heroKicker;

  const title = document.createElement('h3');
  title.className = 'share-dialog-title';
  title.textContent = copy.heroTitle;

  const heroCopy = document.createElement('div');
  heroCopy.className = 'share-dialog-copy';
  heroCopy.textContent = copy.heroCopy;

  hero.appendChild(kicker);
  hero.appendChild(title);
  hero.appendChild(heroCopy);

  const mobileConnectionNotice = document.createElement('div');
  mobileConnectionNotice.className = 'share-notice calder-inline-notice share-connection-presence';
  const mobileConnectionSummary = document.createElement('div');
  mobileConnectionSummary.className = 'share-connection-presence-summary';
  const mobileConnectionMeta = document.createElement('div');
  mobileConnectionMeta.className = 'share-connection-presence-meta';
  mobileConnectionNotice.appendChild(mobileConnectionSummary);
  mobileConnectionNotice.appendChild(mobileConnectionMeta);

  const updateMobileConnectionNotice = (): void => {
    const presence = buildShareDialogMobilePresence({
      sessionId,
      language: uiLanguage,
      nowMs: Date.now(),
    });
    mobileConnectionSummary.textContent = presence.summaryText;
    mobileConnectionMeta.textContent = presence.metaText;
    mobileConnectionNotice.classList.toggle('is-connected', presence.state === 'connected');
    mobileConnectionNotice.classList.toggle('is-waiting', presence.state === 'waiting');
    mobileConnectionNotice.classList.toggle('is-idle', presence.state === 'idle');
  };

  updateMobileConnectionNotice();
  mobilePresenceRefreshTimer = setInterval(updateMobileConnectionNotice, 1000);
  hero.appendChild(mobileConnectionNotice);

  const project = appState.projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  if (project?.projectTeamContext && (project.projectTeamContext.spaces.length > 0 || project.projectTeamContext.sharedRuleCount > 0 || project.projectTeamContext.workflowCount > 0)) {
    const collaborationNote = document.createElement('div');
    collaborationNote.className = 'share-notice calder-inline-notice';
    collaborationNote.textContent = copy.sharedTeamContext(
      project.projectTeamContext.spaces.length,
      project.projectTeamContext.sharedRuleCount,
      project.projectTeamContext.workflowCount,
    );
    hero.appendChild(collaborationNote);
  }
  dialog.appendChild(hero);

  const sections = buildShareDialogSections({
    dialog,
    copy,
    mobileApi,
    onClose: closeShareDialog,
  });

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const flowController = wireShareDialogInteractions({
    sessionId,
    copy,
    uiLanguage,
    mobileApi,
    sharingConfigApi,
    overlay,
    getSelectedMode: sections.getSelectedMode,
    isOverlayActive: () => activeOverlay === overlay,
    statusEl: sections.statusEl,
    passphraseLabel: sections.passphraseLabel,
    passphraseInput: sections.passphraseInput,
    manualToggleRow: sections.manualToggleRow,
    manualToggleBtn: sections.manualToggleBtn,
    manualSection: sections.manualSection,
    offerSection: sections.offerSection,
    offerTextarea: sections.offerTextarea,
    answerSection: sections.answerSection,
    answerTextarea: sections.answerTextarea,
    mobileSection: sections.mobileSection,
    mobileLinkInput: sections.mobileLinkInput,
    mobileFallbackRow: sections.mobileFallbackRow,
    mobileFallbackInput: sections.mobileFallbackInput,
    useMobileFallbackBtn: sections.useMobileFallbackBtn,
    copyMobileFallbackBtn: sections.copyMobileFallbackBtn,
    mobileOtpBadge: sections.mobileOtpBadge,
    mobileOtpHint: sections.mobileOtpHint,
    mobileQrImg: sections.mobileQrImg,
    mobileStatus: sections.mobileStatus,
    retryMobilePairingBtn: sections.retryMobilePairingBtn,
    backBtn: sections.backBtn,
    nextBtn: sections.nextBtn,
    startBtn: sections.startBtn,
    connectBtn: sections.connectBtn,
    phase1: sections.phase1,
    phase2: sections.phase2,
    setPendingShareSessionId: (nextSessionId) => {
      pendingShareSessionId = nextSessionId;
    },
    getPendingShareSessionId: () => pendingShareSessionId,
    onClose: closeShareDialog,
  });
  activeFlowController = flowController;
}

export function closeShareDialog(): void {
  if (activeFlowController) {
    activeFlowController.clearPendingMobilePairing(true);
    activeFlowController = null;
  }
  if (mobilePresenceRefreshTimer) {
    clearInterval(mobilePresenceRefreshTimer);
    mobilePresenceRefreshTimer = null;
  }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (pendingShareSessionId && isSharing(pendingShareSessionId) && !isConnected(pendingShareSessionId)) {
    endShare(pendingShareSessionId);
  }
  pendingShareSessionId = null;
}
