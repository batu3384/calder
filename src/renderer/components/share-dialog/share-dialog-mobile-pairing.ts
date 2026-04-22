import QRCode from 'qrcode';
import type { MobileControlApi } from './share-dialog-api.js';
import type { ShareDialogCopy } from './share-dialog-copy.js';

const MOBILE_ANSWER_POLL_MS = 1250;

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

export async function setShareDialogPrimaryMobileLink(params: SetShareDialogPrimaryLinkParams): Promise<boolean> {
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

export function setShareDialogMobileFallbackLinks(params: SetShareDialogFallbackLinksParams): string {
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

export function formatOtpForDisplay(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  if (digits.length < 4) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export interface CreateMobileAnswerPollingParams {
  mobileApi: MobileControlApi | null;
  isOverlayActive: () => boolean;
  getPendingMobilePairingId: () => string | null;
  setPendingMobilePairingId: (pairingId: string | null) => void;
  getMobilePollingErrorCount: () => number;
  setMobilePollingErrorCount: (count: number) => void;
  stopMobileAnswerPolling: () => void;
  scheduleMobileAnswerPoll: (poller: () => Promise<void>) => void;
  answerTextarea: HTMLTextAreaElement;
  connectBtn: HTMLButtonElement;
  copy: ShareDialogCopy;
  setRetryVisibility: (visible: boolean) => void;
  setManualFallbackVisible: (visible: boolean) => void;
  setMobileStatus: (text: string, kind?: 'info' | 'success' | 'error') => void;
  submitShareAnswer: (answer: string, source: 'mobile') => Promise<void>;
}

export function createMobileAnswerPolling(params: CreateMobileAnswerPollingParams): {
  startMobileAnswerPolling: () => void;
} {
  const {
    mobileApi,
    isOverlayActive,
    getPendingMobilePairingId,
    setPendingMobilePairingId,
    getMobilePollingErrorCount,
    setMobilePollingErrorCount,
    stopMobileAnswerPolling,
    scheduleMobileAnswerPoll,
    answerTextarea,
    connectBtn,
    copy,
    setRetryVisibility,
    setManualFallbackVisible,
    setMobileStatus,
    submitShareAnswer,
  } = params;

  const pollMobileAnswer = async (): Promise<void> => {
    const pairingId = getPendingMobilePairingId();
    if (!mobileApi || !pairingId || !isOverlayActive()) return;
    try {
      const result = await mobileApi.consumeControlAnswer(pairingId);
      if (result.status === 'ready' && result.answer) {
        setPendingMobilePairingId(null);
        stopMobileAnswerPolling();
        setMobilePollingErrorCount(0);
        answerTextarea.value = result.answer;
        connectBtn.disabled = false;
        await submitShareAnswer(result.answer, 'mobile');
        return;
      }
      if (result.status === 'expired') {
        setPendingMobilePairingId(null);
        stopMobileAnswerPolling();
        setMobilePollingErrorCount(0);
        setRetryVisibility(true);
        setManualFallbackVisible(true);
        setMobileStatus(copy.mobilePairingExpired, 'error');
        return;
      }
      setMobilePollingErrorCount(0);
    } catch {
      const nextErrorCount = getMobilePollingErrorCount() + 1;
      setMobilePollingErrorCount(nextErrorCount);
      setRetryVisibility(true);
      if (nextErrorCount >= 3) {
        setPendingMobilePairingId(null);
        stopMobileAnswerPolling();
        setManualFallbackVisible(true);
        setMobileStatus(copy.mobilePairingCheckFailedRepeated, 'error');
        return;
      }
      setMobileStatus(copy.mobilePairingCheckFailedRetrying, 'error');
    }
    if (getPendingMobilePairingId() && isOverlayActive()) {
      scheduleMobileAnswerPoll(pollMobileAnswer);
    }
  };

  const startMobileAnswerPolling = (): void => {
    if (!getPendingMobilePairingId()) return;
    stopMobileAnswerPolling();
    setMobilePollingErrorCount(0);
    scheduleMobileAnswerPoll(pollMobileAnswer);
  };

  return {
    startMobileAnswerPolling,
  };
}

export function scheduleMobileAnswerPoll(
  setTimer: (timer: ReturnType<typeof setTimeout>) => void,
  poller: () => Promise<void>,
): void {
  const timer = setTimeout(() => {
    void poller();
  }, MOBILE_ANSWER_POLL_MS);
  setTimer(timer);
}
