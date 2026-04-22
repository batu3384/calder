// Share dialog — host-side UI for sharing a session via P2P.

import type { ShareMode } from '../../../shared/sharing-types.js';
import { endShare } from '../../sharing/share-manager.js';
import { isSharing, isConnected } from '../../sharing/peer-host.js';
import { appState } from '../../state.js';
import {
  createShareDialogFlowController,
  type ShareDialogFlowController,
} from './share-dialog-flow-controller.js';
import { createShareDialogPhaseTwo } from './share-dialog-phase-two.js';
import type { MobileControlApi, SharingConfigApi } from './share-dialog-api.js';
import { bindStartSharingHandler } from './share-dialog-start-handler.js';
import {
  bindShareDialogPhaseNavigation,
  createShareDialogActions,
  createShareDialogPhaseOne,
} from './share-dialog-shell.js';
import {
  getShareDialogCopy,
  resolveShareDialogLanguage,
} from './share-dialog-copy.js';
import { buildShareDialogMobilePresence } from './share-dialog-mobile-presence.js';

export type { ShareDialogCopy } from './share-dialog-copy.js';
export {
  buildShareDialogMobilePresence,
  formatShareConnectionDuration,
  getShareDialogMobilePresenceCopy,
} from './share-dialog-mobile-presence.js';
export type { ShareDialogMobilePresenceCopy, ShareDialogMobilePresenceView } from './share-dialog-mobile-presence.js';

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

  let selectedMode: ShareMode = 'readonly';
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

  const { phase1, modeGroup, rwWarning } = createShareDialogPhaseOne(copy, Boolean(mobileApi));
  modeGroup.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value as ShareMode;
    selectedMode = value;
    rwWarning.classList.toggle('hidden', value !== 'readwrite');
  });
  dialog.appendChild(phase1);

  const {
    phase2,
    passphraseLabel,
    passphraseInput,
    manualToggleRow,
    manualToggleBtn,
    manualSection,
    offerSection,
    offerTextarea,
    answerSection,
    answerTextarea,
    mobileSection,
    mobileLinkInput,
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
    mobileOtpBadge,
    mobileOtpHint,
    mobileQrImg,
    mobileStatus,
    retryMobilePairingBtn,
  } = createShareDialogPhaseTwo(copy);
  dialog.appendChild(phase2);

  const statusEl = document.createElement('div');
  statusEl.className = 'share-status';
  dialog.appendChild(statusEl);

  const { actions, closeBtn, backBtn, nextBtn, startBtn, connectBtn } = createShareDialogActions(copy);
  closeBtn.addEventListener('click', closeShareDialog);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  bindShareDialogPhaseNavigation({
    phase1,
    phase2,
    nextBtn,
    backBtn,
    startBtn,
    passphraseInput,
    statusEl,
  });

  // Enable Connect only when answer code is entered
  answerTextarea.addEventListener('input', () => {
    connectBtn.disabled = !String(answerTextarea.value ?? '').trim();
  });

  const flowController = createShareDialogFlowController({
    sessionId,
    copy,
    mobileApi,
    getSelectedMode: () => selectedMode,
    isOverlayActive: () => activeOverlay === overlay,
    statusEl,
    manualToggleRow,
    manualToggleBtn,
    manualSection,
    answerTextarea,
    connectBtn,
    mobileLinkInput,
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
    mobileOtpBadge,
    mobileOtpHint,
    mobileQrImg,
    mobileStatus,
    retryMobilePairingBtn,
  });
  activeFlowController = flowController;

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeShareDialog();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeShareDialog();
  });

  bindStartSharingHandler({
    sessionId,
    getSelectedMode: () => selectedMode,
    passphraseInput,
    passphraseLabel,
    offerSection,
    offerTextarea,
    answerSection,
    answerTextarea,
    startBtn,
    backBtn,
    connectBtn,
    statusEl,
    mobileSection,
    mobileApi,
    sharingConfigApi,
    flowController,
    copy,
    uiLanguage,
    clearPendingMobilePairing: (revoke) => {
      flowController.clearPendingMobilePairing(revoke);
    },
    setPendingShareSessionId: (nextSessionId) => {
      pendingShareSessionId = nextSessionId;
    },
    getPendingShareSessionId: () => pendingShareSessionId,
    closeShareDialog,
  });
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
