import type { ShareMode } from '../../../shared/sharing-types.js';
import { decodeConnectionEnvelope } from '../../sharing/webrtc-utils.js';
import { appState } from '../../state.js';
import type { MobileControlApi } from './share-dialog-api.js';
import type { ShareDialogCopy } from './share-dialog-copy.js';
import { submitShareDialogAnswer } from './share-dialog-flow-submit-answer.js';
import {
  bindConnectAndRetryHandlers,
  bindUseMobileFallbackButton,
  createFlowControllerResult,
  setupManualFallbackUi,
} from './share-dialog-flow-ui-bindings.js';
import {
  createMobileAnswerPolling,
  formatOtpForDisplay,
  scheduleMobileAnswerPoll as scheduleMobileAnswerPollTimer,
  setShareDialogMobileFallbackLinks,
  setShareDialogPrimaryMobileLink,
} from './share-dialog-mobile-pairing.js';

export interface ShareDialogFlowController {
  setManualFallbackVisible(visible: boolean): void;
  setShareHandshake(offer: string | null, passphrase: string | null): void;
  generateMobilePairing(): Promise<void>;
  handleAuthFailure(): void;
  clearPendingMobilePairing(revoke: boolean): void;
}

export interface CreateShareDialogFlowControllerParams {
  sessionId: string;
  copy: ShareDialogCopy;
  mobileApi: MobileControlApi | null;
  getSelectedMode: () => ShareMode;
  isOverlayActive: () => boolean;
  statusEl: HTMLDivElement;
  manualToggleRow: HTMLDivElement;
  manualToggleBtn: HTMLButtonElement;
  manualSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
  connectBtn: HTMLButtonElement;
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
}

interface GenerateShareDialogMobilePairingParams {
  sessionId: string;
  mobileApi: MobileControlApi | null;
  currentShareOffer: string | null;
  currentSharePassphrase: string | null;
  getSelectedMode: () => ShareMode;
  isOverlayActive: () => boolean;
  copy: ShareDialogCopy;
  clearPendingMobilePairing: (revoke: boolean) => void;
  setPendingMobilePairingId: (pairingId: string | null) => void;
  setMobilePollingErrorCount: (count: number) => void;
  setManualFallbackVisible: (visible: boolean) => void;
  setRetryVisibility: (visible: boolean) => void;
  setMobileStatus: (text: string, kind?: 'info' | 'success' | 'error') => void;
  mobileOtpHint: HTMLDivElement;
  mobileOtpBadge: HTMLDivElement;
  mobileFallbackInput: HTMLInputElement;
  mobileFallbackRow: HTMLDivElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
  mobileLinkInput: HTMLInputElement;
  mobileQrImg: HTMLImageElement;
  startMobileAnswerPolling: () => void;
}

async function generateShareDialogMobilePairing(params: GenerateShareDialogMobilePairingParams): Promise<void> {
  const {
    sessionId,
    mobileApi,
    currentShareOffer,
    currentSharePassphrase,
    getSelectedMode,
    isOverlayActive,
    copy,
    clearPendingMobilePairing,
    setPendingMobilePairingId,
    setMobilePollingErrorCount,
    setManualFallbackVisible,
    setRetryVisibility,
    setMobileStatus,
    mobileOtpHint,
    mobileOtpBadge,
    mobileFallbackInput,
    mobileFallbackRow,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
    mobileLinkInput,
    mobileQrImg,
    startMobileAnswerPolling,
  } = params;

  if (!mobileApi || !currentShareOffer || !currentSharePassphrase || !isOverlayActive()) return;
  setRetryVisibility(false);
  setMobileStatus(copy.generatingMobilePairing);
  mobileOtpHint.textContent = copy.waitingPairingCode;
  clearPendingMobilePairing(true);

  try {
    const decodedOffer = await decodeConnectionEnvelope(currentShareOffer, 'offer', currentSharePassphrase);
    const offerDescription = decodedOffer.description;
    if (offerDescription.type !== 'offer' || typeof offerDescription.sdp !== 'string') {
      throw new Error(copy.mobileHandoffFailedFallback);
    }
    const pairing = await mobileApi.createControlPairing(
      sessionId,
      currentShareOffer,
      currentSharePassphrase,
      getSelectedMode(),
      appState.preferences.language ?? 'en',
      {
        type: 'offer',
        sdp: offerDescription.sdp,
      },
    );
    if (!isOverlayActive()) {
      void mobileApi.revokeControlPairing(pairing.pairingId).catch(() => {});
      return;
    }

    setPendingMobilePairingId(pairing.pairingId);
    setMobilePollingErrorCount(0);

    const localFallbackLinks = Array.isArray(pairing.localPairingUrls) && pairing.localPairingUrls.length > 0
      ? pairing.localPairingUrls
      : [pairing.localPairingUrl];
    const primaryLink = pairing.pairingUrl || localFallbackLinks[0] || pairing.localPairingUrl;
    setShareDialogMobileFallbackLinks({
      links: localFallbackLinks,
      primaryLink,
      mobileFallbackInput,
      mobileFallbackRow,
      useMobileFallbackBtn,
      copyMobileFallbackBtn,
    });

    const hasQr = await setShareDialogPrimaryMobileLink({
      link: primaryLink,
      mobileLinkInput,
      mobileQrImg,
    });
    const otpDisplay = formatOtpForDisplay(pairing.otpCode);
    mobileOtpBadge.textContent = otpDisplay;
    mobileOtpHint.textContent = copy.otpUsageHint(otpDisplay);

    const expiresAt = new Date(pairing.expiresAt);
    const expiresLabel = Number.isNaN(expiresAt.getTime())
      ? copy.soon
      : expiresAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const modeLabel = pairing.accessMode === 'remote' ? copy.remoteModeActive : copy.lanModeActive;
    const statusMessage = `${modeLabel} ${copy.scanQrBefore(expiresLabel)}`;
    if (hasQr) {
      setMobileStatus(statusMessage, 'success');
    } else {
      setMobileStatus(`${statusMessage} ${copy.qrUnavailableUseLink}`, 'error');
    }
    startMobileAnswerPolling();
  } catch (error) {
    setMobilePollingErrorCount(0);
    setManualFallbackVisible(true);
    setRetryVisibility(true);
    mobileOtpHint.textContent = copy.waitingPairingCode;
    setMobileStatus(
      error instanceof Error
        ? copy.mobileHandoffFailedWithReason(error.message)
        : copy.mobileHandoffFailedFallback,
      'error',
    );
  }
}

export function createShareDialogFlowController(params: CreateShareDialogFlowControllerParams): ShareDialogFlowController {
  const {
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
  } = params;

  let manualFallbackVisible = !mobileApi;
  let currentShareOffer: string | null = null;
  let currentSharePassphrase: string | null = null;
  let mobilePollingErrorCount = 0;
  let pendingMobilePairingId: string | null = null;
  let mobileAnswerPollTimer: ReturnType<typeof setTimeout> | null = null;

  const stopMobileAnswerPolling = (): void => {
    if (mobileAnswerPollTimer) {
      clearTimeout(mobileAnswerPollTimer);
      mobileAnswerPollTimer = null;
    }
  };

  const clearPendingMobilePairing = (revoke: boolean): void => {
    stopMobileAnswerPolling();
    const pairingId = pendingMobilePairingId;
    pendingMobilePairingId = null;
    if (!revoke || !pairingId || !mobileApi) return;
    void mobileApi.revokeControlPairing(pairingId).catch(() => {});
  };

  const setManualFallbackVisible = (visible: boolean): void => {
    manualFallbackVisible = visible;
    manualSection.classList.toggle('hidden', !visible);
    manualToggleBtn.textContent = visible ? copy.hideManualCodes : copy.showManualCodes;
    if (mobileApi) {
      connectBtn.classList.toggle('hidden', !visible);
    } else {
      connectBtn.classList.remove('hidden');
    }
  };

  setupManualFallbackUi({
    mobileApi,
    manualToggleRow,
    manualToggleBtn,
    isManualFallbackVisible: () => manualFallbackVisible,
    setManualFallbackVisible,
  });

  const setMobileStatus = (text: string, kind: 'info' | 'success' | 'error' = 'info'): void => {
    mobileStatus.textContent = text;
    mobileStatus.classList.remove('is-success');
    mobileStatus.classList.remove('is-error');
    if (kind === 'success') mobileStatus.classList.add('is-success');
    if (kind === 'error') mobileStatus.classList.add('is-error');
  };

  const setRetryVisibility = (visible: boolean): void => {
    retryMobilePairingBtn.classList.toggle('hidden', !visible);
    retryMobilePairingBtn.disabled = !visible;
  };

  bindUseMobileFallbackButton({
    useMobileFallbackBtn,
    mobileFallbackInput,
    mobileLinkInput,
    mobileQrImg,
    copy,
    setMobileStatus,
  });

  const submitShareAnswer = async (answer: string, source: 'manual' | 'mobile'): Promise<void> => {
    await submitShareDialogAnswer({
      sessionId,
      answer,
      source,
      copy,
      statusEl,
      answerTextarea,
      connectBtn,
      clearPendingMobilePairing,
      setMobileStatus,
    });
  };

  const scheduleMobileAnswerPoll = (poller: () => Promise<void>): void => {
    scheduleMobileAnswerPollTimer((timer) => {
      mobileAnswerPollTimer = timer;
    }, poller);
  };

  const { startMobileAnswerPolling } = createMobileAnswerPolling({
    mobileApi,
    isOverlayActive,
    getPendingMobilePairingId: () => pendingMobilePairingId,
    setPendingMobilePairingId: (pairingId) => {
      pendingMobilePairingId = pairingId;
    },
    getMobilePollingErrorCount: () => mobilePollingErrorCount,
    setMobilePollingErrorCount: (count) => {
      mobilePollingErrorCount = count;
    },
    stopMobileAnswerPolling,
    scheduleMobileAnswerPoll,
    answerTextarea,
    connectBtn,
    copy,
    setRetryVisibility,
    setManualFallbackVisible,
    setMobileStatus,
    submitShareAnswer: async (answer, source) => {
      await submitShareAnswer(answer, source);
    },
  });

  const generateMobilePairing = async (): Promise<void> => {
    await generateShareDialogMobilePairing({
      sessionId,
      mobileApi,
      currentShareOffer,
      currentSharePassphrase,
      getSelectedMode,
      isOverlayActive,
      copy,
      clearPendingMobilePairing,
      setPendingMobilePairingId: (pairingId) => {
        pendingMobilePairingId = pairingId;
      },
      setMobilePollingErrorCount: (count) => {
        mobilePollingErrorCount = count;
      },
      setManualFallbackVisible,
      setRetryVisibility,
      setMobileStatus,
      mobileOtpHint,
      mobileOtpBadge,
      mobileFallbackInput,
      mobileFallbackRow,
      useMobileFallbackBtn,
      copyMobileFallbackBtn,
      mobileLinkInput,
      mobileQrImg,
      startMobileAnswerPolling,
    });
  };

  bindConnectAndRetryHandlers({
    connectBtn,
    answerTextarea,
    retryMobilePairingBtn,
    generateMobilePairing,
    submitShareAnswer: async (answer: string) => {
      await submitShareAnswer(answer, 'manual');
    },
  });

  const setShareHandshake = (offer: string | null, passphrase: string | null): void => {
    currentShareOffer = offer;
    currentSharePassphrase = passphrase;
    if (!offer || !passphrase) {
      mobilePollingErrorCount = 0;
    }
  };

  return createFlowControllerResult({
    setManualFallbackVisible,
    setShareHandshake,
    generateMobilePairing,
    handleAuthFailure: () => {
      setManualFallbackVisible(true);
      setRetryVisibility(true);
      setMobileStatus(copy.authenticationFailedRestart, 'error');
    },
    clearPendingMobilePairing,
  });
}
