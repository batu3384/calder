import type { MobileControlApi } from './share-dialog-api.js';
import type { ShareDialogCopy } from './share-dialog-copy.js';
import { setShareDialogPrimaryMobileLink } from './share-dialog-mobile-pairing.js';

export interface SetupManualFallbackUiParams {
  mobileApi: MobileControlApi | null;
  manualToggleRow: HTMLDivElement;
  manualToggleBtn: HTMLButtonElement;
  isManualFallbackVisible: () => boolean;
  setManualFallbackVisible: (visible: boolean) => void;
}

export function setupManualFallbackUi(params: SetupManualFallbackUiParams): void {
  const {
    mobileApi,
    manualToggleRow,
    manualToggleBtn,
    isManualFallbackVisible,
    setManualFallbackVisible,
  } = params;

  if (mobileApi) {
    manualToggleRow.classList.remove('hidden');
    manualToggleBtn.addEventListener('click', () => {
      setManualFallbackVisible(!isManualFallbackVisible());
    });
    setManualFallbackVisible(false);
    return;
  }

  manualToggleRow.classList.add('hidden');
  setManualFallbackVisible(true);
}

export interface BindUseMobileFallbackButtonParams {
  useMobileFallbackBtn: HTMLButtonElement;
  mobileFallbackInput: HTMLInputElement;
  mobileLinkInput: HTMLInputElement;
  mobileQrImg: HTMLImageElement;
  copy: ShareDialogCopy;
  setMobileStatus: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

export function bindUseMobileFallbackButton(params: BindUseMobileFallbackButtonParams): void {
  const {
    useMobileFallbackBtn,
    mobileFallbackInput,
    mobileLinkInput,
    mobileQrImg,
    copy,
    setMobileStatus,
  } = params;

  useMobileFallbackBtn.addEventListener('click', () => {
    const fallback = mobileFallbackInput.value.trim();
    if (!fallback) return;
    void setShareDialogPrimaryMobileLink({
      link: fallback,
      mobileLinkInput,
      mobileQrImg,
    }).then((hasQr) => {
      setMobileStatus(
        hasQr ? copy.usingLanFallback : `${copy.usingLanFallback} ${copy.qrUnavailableUseLink}`,
      );
    });
  });
}

export interface BindConnectAndRetryHandlersParams {
  connectBtn: HTMLButtonElement;
  answerTextarea: HTMLTextAreaElement;
  retryMobilePairingBtn: HTMLButtonElement;
  generateMobilePairing: () => Promise<void>;
  submitShareAnswer: (answer: string) => Promise<void>;
}

export function bindConnectAndRetryHandlers(params: BindConnectAndRetryHandlersParams): void {
  const {
    connectBtn,
    answerTextarea,
    retryMobilePairingBtn,
    generateMobilePairing,
    submitShareAnswer,
  } = params;

  connectBtn.addEventListener('click', async () => {
    const answer = String(answerTextarea.value ?? '').trim();
    if (!answer) return;
    await submitShareAnswer(answer);
  });

  retryMobilePairingBtn.addEventListener('click', () => {
    retryMobilePairingBtn.disabled = true;
    void generateMobilePairing().finally(() => {
      if (!retryMobilePairingBtn.classList.contains('hidden')) {
        retryMobilePairingBtn.disabled = false;
      }
    });
  });
}

export interface CreateFlowControllerResultParams {
  setManualFallbackVisible: (visible: boolean) => void;
  setShareHandshake: (offer: string | null, passphrase: string | null) => void;
  generateMobilePairing: () => Promise<void>;
  handleAuthFailure: () => void;
  clearPendingMobilePairing: (revoke: boolean) => void;
}

export function createFlowControllerResult(params: CreateFlowControllerResultParams) {
  const {
    setManualFallbackVisible,
    setShareHandshake,
    generateMobilePairing,
    handleAuthFailure,
    clearPendingMobilePairing,
  } = params;

  return {
    setManualFallbackVisible,
    setShareHandshake,
    generateMobilePairing,
    handleAuthFailure,
    clearPendingMobilePairing,
  };
}
