import type { ShareMode } from '../../../shared/sharing-types.js';
import type { MobileControlApi, SharingConfigApi } from './share-dialog-api.js';
import type { ShareDialogCopy, ShareDialogLanguage } from './share-dialog-copy.js';
import {
  createShareDialogFlowController,
  type ShareDialogFlowController,
} from './share-dialog-flow-controller.js';
import { createShareDialogPhaseTwo } from './share-dialog-phase-two.js';
import {
  bindShareDialogPhaseNavigation,
  createShareDialogActions,
  createShareDialogPhaseOne,
} from './share-dialog-shell.js';
import { bindStartSharingHandler } from './share-dialog-start-handler.js';

interface BuildShareDialogSectionsArgs {
  dialog: HTMLDivElement;
  copy: ShareDialogCopy;
  mobileApi: MobileControlApi | null;
  onClose: () => void;
}

interface WireShareDialogInteractionsArgs {
  sessionId: string;
  copy: ShareDialogCopy;
  uiLanguage: ShareDialogLanguage;
  mobileApi: MobileControlApi | null;
  sharingConfigApi: SharingConfigApi | null;
  overlay: HTMLDivElement;
  getSelectedMode: () => ShareMode;
  isOverlayActive: () => boolean;
  statusEl: HTMLDivElement;
  passphraseLabel: HTMLDivElement;
  passphraseInput: HTMLInputElement;
  manualToggleRow: HTMLDivElement;
  manualToggleBtn: HTMLButtonElement;
  manualSection: HTMLDivElement;
  offerSection: HTMLDivElement;
  offerTextarea: HTMLTextAreaElement;
  answerSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
  mobileSection: HTMLDivElement;
  mobileLinkInput: HTMLInputElement;
  mobileFallbackRow: HTMLDivElement;
  mobileFallbackInput: HTMLInputElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
  mobileOtpBadge: HTMLDivElement;
  mobileOtpHint: HTMLDivElement;
  mobileQrImg: HTMLImageElement;
  mobileStatus: HTMLDivElement;
  retryMobilePairingBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  connectBtn: HTMLButtonElement;
  phase1: HTMLDivElement;
  phase2: HTMLDivElement;
  setPendingShareSessionId: (nextSessionId: string | null) => void;
  getPendingShareSessionId: () => string | null;
  onClose: () => void;
}

export interface ShareDialogSections {
  getSelectedMode: () => ShareMode;
  phase1: HTMLDivElement;
  phase2: HTMLDivElement;
  passphraseLabel: HTMLDivElement;
  passphraseInput: HTMLInputElement;
  manualToggleRow: HTMLDivElement;
  manualToggleBtn: HTMLButtonElement;
  manualSection: HTMLDivElement;
  offerSection: HTMLDivElement;
  offerTextarea: HTMLTextAreaElement;
  answerSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
  mobileSection: HTMLDivElement;
  mobileLinkInput: HTMLInputElement;
  mobileFallbackRow: HTMLDivElement;
  mobileFallbackInput: HTMLInputElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
  mobileOtpBadge: HTMLDivElement;
  mobileOtpHint: HTMLDivElement;
  mobileQrImg: HTMLImageElement;
  mobileStatus: HTMLDivElement;
  retryMobilePairingBtn: HTMLButtonElement;
  statusEl: HTMLDivElement;
  backBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  connectBtn: HTMLButtonElement;
}

export function buildShareDialogSections(args: BuildShareDialogSectionsArgs): ShareDialogSections {
  const { dialog, copy, mobileApi, onClose } = args;
  let selectedMode: ShareMode = 'readonly';

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

  const { actions, closeBtn, backBtn, nextBtn, startBtn, connectBtn } =
    createShareDialogActions(copy);
  closeBtn.addEventListener('click', onClose);
  dialog.appendChild(actions);

  return {
    getSelectedMode: () => selectedMode,
    phase1,
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
    statusEl,
    backBtn,
    nextBtn,
    startBtn,
    connectBtn,
  };
}

export function wireShareDialogInteractions(
  args: WireShareDialogInteractionsArgs,
): ShareDialogFlowController {
  const {
    sessionId,
    copy,
    uiLanguage,
    mobileApi,
    sharingConfigApi,
    overlay,
    getSelectedMode,
    isOverlayActive,
    statusEl,
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
    backBtn,
    nextBtn,
    startBtn,
    connectBtn,
    phase1,
    phase2,
    setPendingShareSessionId,
    getPendingShareSessionId,
    onClose,
  } = args;

  bindShareDialogPhaseNavigation({
    phase1,
    phase2,
    nextBtn,
    backBtn,
    startBtn,
    passphraseInput,
    statusEl,
  });

  answerTextarea.addEventListener('input', () => {
    connectBtn.disabled = !String(answerTextarea.value ?? '').trim();
  });

  const flowController = createShareDialogFlowController({
    sessionId,
    copy,
    mobileApi,
    getSelectedMode,
    isOverlayActive,
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

  overlay.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) onClose();
  });

  bindStartSharingHandler({
    sessionId,
    getSelectedMode,
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
    setPendingShareSessionId,
    getPendingShareSessionId,
    closeShareDialog: onClose,
  });

  return flowController;
}
