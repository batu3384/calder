import QRCode from 'qrcode';
import type { ShareMode } from '../../shared/sharing-types.js';
import { acceptShareAnswer } from '../sharing/share-manager.js';
import { decodeConnectionEnvelope } from '../sharing/webrtc-utils.js';
import { appState } from '../state.js';
import type { MobileControlApi } from './share-dialog-api.js';
import type { ShareDialogCopy } from './share-dialog-copy.js';

const MOBILE_ANSWER_POLL_MS = 1250;

interface SubmitShareDialogAnswerParams {
  sessionId: string;
  answer: string;
  source: 'manual' | 'mobile';
  copy: ShareDialogCopy;
  statusEl: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
  connectBtn: HTMLButtonElement;
  clearPendingMobilePairing(revoke: boolean): void;
  setMobileStatus: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

interface SetShareDialogPrimaryLinkParams {
  link: string;
  mobileLinkInput: HTMLInputElement;
  mobileQrImg: HTMLImageElement;
}

interface SetShareDialogFallbackLinksParams {
  links: string[];
  primaryLink: string;
  mobileFallbackInput: HTMLInputElement;
  mobileFallbackRow: HTMLDivElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
}

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

async function submitShareDialogAnswer(params: SubmitShareDialogAnswerParams): Promise<void> {
  const {
    sessionId,
    answer,
    source,
    copy,
    statusEl,
    answerTextarea,
    connectBtn,
    clearPendingMobilePairing,
    setMobileStatus,
  } = params;

  const trimmed = answer.trim();
  if (!trimmed) return;
  if (source === 'manual') {
    clearPendingMobilePairing(true);
    setMobileStatus(copy.manualResponseDetected);
  }
  try {
    await acceptShareAnswer(sessionId, trimmed);
    connectBtn.disabled = true;
    connectBtn.textContent = copy.connecting;
    answerTextarea.readOnly = true;
    statusEl.textContent = copy.establishingConnection;
    if (source === 'mobile') {
      setMobileStatus(copy.mobileResponseReceived, 'success');
    }
  } catch (err) {
    const reasonText = err instanceof Error ? err.message : copy.invalidResponseCode;
    statusEl.textContent = reasonText;
    answerTextarea.readOnly = false;
    connectBtn.disabled = !answerTextarea.value.trim();
    connectBtn.textContent = copy.connect;
    if (source === 'mobile') {
      setMobileStatus(`${copy.mobileResponseValidationFailed} ${reasonText}`, 'error');
    }
  }
}

async function createQrDataUrl(value: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(value, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#111111',
        light: '#ffffff',
      },
    });
  } catch {
    return null;
  }
}

async function setShareDialogPrimaryMobileLink(params: SetShareDialogPrimaryLinkParams): Promise<boolean> {
  const { link, mobileLinkInput, mobileQrImg } = params;
  mobileLinkInput.value = link;
  const qrDataUrl = await createQrDataUrl(link);
  if (qrDataUrl) {
    mobileQrImg.src = qrDataUrl;
    mobileQrImg.classList.remove('hidden');
    return true;
  }
  mobileQrImg.classList.add('hidden');
  return false;
}

function isLoopbackShareDialogLink(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function setShareDialogMobileFallbackLinks(params: SetShareDialogFallbackLinksParams): string {
  const {
    links,
    primaryLink,
    mobileFallbackInput,
    mobileFallbackRow,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
  } = params;
  const deduped = Array.from(new Set(links.filter((link) => link && link.trim().length > 0)));
  const fallback = deduped.find((link) => link !== primaryLink && !isLoopbackShareDialogLink(link)) ?? '';
  mobileFallbackInput.value = fallback;
  mobileFallbackRow.classList.toggle('hidden', !fallback);
  useMobileFallbackBtn.disabled = !fallback;
  copyMobileFallbackBtn.disabled = !fallback;
  return fallback;
}

function formatOtpForDisplay(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  if (digits.length < 4) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
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

  if (mobileApi) {
    manualToggleRow.classList.remove('hidden');
    manualToggleBtn.addEventListener('click', () => {
      setManualFallbackVisible(!manualFallbackVisible);
    });
    setManualFallbackVisible(false);
  } else {
    manualToggleRow.classList.add('hidden');
    setManualFallbackVisible(true);
  }

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

  useMobileFallbackBtn.addEventListener('click', () => {
    const fallback = mobileFallbackInput.value.trim();
    if (!fallback) return;
    void setShareDialogPrimaryMobileLink({
      link: fallback,
      mobileLinkInput,
      mobileQrImg,
    }).then((hasQr) => {
      setMobileStatus(hasQr ? copy.usingLanFallback : `${copy.usingLanFallback} ${copy.qrUnavailableUseLink}`);
    });
  });

  const pollMobileAnswer = async (): Promise<void> => {
    if (!mobileApi || !pendingMobilePairingId || !isOverlayActive()) return;
    try {
      const result = await mobileApi.consumeControlAnswer(pendingMobilePairingId);
      if (result.status === 'ready' && result.answer) {
        pendingMobilePairingId = null;
        stopMobileAnswerPolling();
        mobilePollingErrorCount = 0;
        answerTextarea.value = result.answer;
        connectBtn.disabled = false;
        await submitShareDialogAnswer({
          sessionId,
          answer: result.answer,
          source: 'mobile',
          copy,
          statusEl,
          answerTextarea,
          connectBtn,
          clearPendingMobilePairing,
          setMobileStatus,
        });
        return;
      }
      if (result.status === 'expired') {
        pendingMobilePairingId = null;
        stopMobileAnswerPolling();
        mobilePollingErrorCount = 0;
        setRetryVisibility(true);
        setManualFallbackVisible(true);
        setMobileStatus(copy.mobilePairingExpired, 'error');
        return;
      }
      mobilePollingErrorCount = 0;
    } catch {
      mobilePollingErrorCount += 1;
      setRetryVisibility(true);
      if (mobilePollingErrorCount >= 3) {
        pendingMobilePairingId = null;
        stopMobileAnswerPolling();
        setManualFallbackVisible(true);
        setMobileStatus(copy.mobilePairingCheckFailedRepeated, 'error');
        return;
      }
      setMobileStatus(copy.mobilePairingCheckFailedRetrying, 'error');
    }
    if (pendingMobilePairingId && isOverlayActive()) {
      mobileAnswerPollTimer = setTimeout(() => {
        void pollMobileAnswer();
      }, MOBILE_ANSWER_POLL_MS);
    }
  };

  const startMobileAnswerPolling = (): void => {
    if (!pendingMobilePairingId) return;
    stopMobileAnswerPolling();
    mobilePollingErrorCount = 0;
    mobileAnswerPollTimer = setTimeout(() => {
      void pollMobileAnswer();
    }, MOBILE_ANSWER_POLL_MS);
  };

  const generateMobilePairing = async (): Promise<void> => {
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
      pendingMobilePairingId = pairing.pairingId;
      mobilePollingErrorCount = 0;
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
      mobilePollingErrorCount = 0;
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
  };

  connectBtn.addEventListener('click', async () => {
    const answer = String(answerTextarea.value ?? '').trim();
    if (!answer) return;
    await submitShareDialogAnswer({
      sessionId,
      answer,
      source: 'manual',
      copy,
      statusEl,
      answerTextarea,
      connectBtn,
      clearPendingMobilePairing,
      setMobileStatus,
    });
  });

  retryMobilePairingBtn.addEventListener('click', () => {
    retryMobilePairingBtn.disabled = true;
    void generateMobilePairing().finally(() => {
      if (!retryMobilePairingBtn.classList.contains('hidden')) {
        retryMobilePairingBtn.disabled = false;
      }
    });
  });

  return {
    setManualFallbackVisible,
    setShareHandshake: (offer: string | null, passphrase: string | null) => {
      currentShareOffer = offer;
      currentSharePassphrase = passphrase;
      if (!offer || !passphrase) {
        mobilePollingErrorCount = 0;
      }
    },
    generateMobilePairing,
    handleAuthFailure: () => {
      setManualFallbackVisible(true);
      setRetryVisibility(true);
      setMobileStatus(copy.authenticationFailedRestart, 'error');
    },
    clearPendingMobilePairing,
  };
}
