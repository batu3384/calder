import type { ShareMode } from '../../../shared/sharing-types.js';
import type { ShareRtcConfig } from '../../../shared/types/project-core.js';
import { shareSession, endShare } from '../../sharing/share-manager.js';
import { isSharing } from '../../sharing/peer-host.js';
import { validateSharePassphrase } from '../../sharing/share-crypto.js';
import {
  localizePassphraseError,
  type ShareDialogCopy,
  type ShareDialogLanguage,
} from './share-dialog-copy.js';
import type { MobileControlApi, SharingConfigApi } from './share-dialog-api.js';

interface ShareDialogFlowController {
  setManualFallbackVisible(visible: boolean): void;
  setShareHandshake(offer: string | null, passphrase: string | null): void;
  generateMobilePairing(): Promise<void>;
  handleAuthFailure(): void;
}

interface BindStartSharingHandlerParams {
  sessionId: string;
  getSelectedMode: () => ShareMode;
  passphraseInput: HTMLInputElement;
  passphraseLabel: HTMLDivElement;
  offerSection: HTMLDivElement;
  offerTextarea: HTMLTextAreaElement;
  answerSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
  startBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  connectBtn: HTMLButtonElement;
  statusEl: HTMLDivElement;
  mobileSection: HTMLDivElement;
  mobileApi: MobileControlApi | null;
  sharingConfigApi: SharingConfigApi | null;
  flowController: ShareDialogFlowController;
  copy: ShareDialogCopy;
  uiLanguage: ShareDialogLanguage;
  clearPendingMobilePairing(revoke: boolean): void;
  setPendingShareSessionId(sessionId: string | null): void;
  getPendingShareSessionId(): string | null;
  closeShareDialog(): void;
}

export function bindStartSharingHandler(params: BindStartSharingHandlerParams): void {
  const {
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
    clearPendingMobilePairing,
    setPendingShareSessionId,
    getPendingShareSessionId,
    closeShareDialog,
  } = params;

  startBtn.addEventListener('click', async () => {
    const passphrase = String(passphraseInput.value ?? '').trim();
    const passphraseError = validateSharePassphrase(passphrase);
    if (passphraseError) {
      statusEl.textContent = localizePassphraseError(passphraseError, uiLanguage);
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = copy.generatingCode;
    statusEl.textContent = copy.generatingConnectionCode;

    setPendingShareSessionId(sessionId);

    try {
      let rtcConfig: ShareRtcConfig | undefined;
      if (sharingConfigApi) {
        try {
          rtcConfig = await sharingConfigApi.getRtcConfig();
        } catch {
          rtcConfig = undefined;
        }
      }

      const shareResult = rtcConfig
        ? await shareSession(sessionId, getSelectedMode(), passphrase, rtcConfig)
        : await shareSession(sessionId, getSelectedMode(), passphrase);
      const { offer, handle } = shareResult;

      passphraseInput.readOnly = true;
      passphraseLabel.textContent = copy.passphraseLabel;
      offerTextarea.value = offer;
      offerSection.classList.remove('hidden');
      answerSection.classList.remove('hidden');
      flowController.setShareHandshake(offer, passphrase);
      startBtn.classList.add('hidden');
      backBtn.classList.add('hidden');
      connectBtn.classList.remove('hidden');
      statusEl.textContent = copy.waitingForPeer;
      if (rtcConfig?.iceTransportPolicy === 'relay') {
        statusEl.textContent = copy.waitingForPeerTurn;
      }
      flowController.setManualFallbackVisible(!mobileApi);

      handle.onConnected(() => {
        closeShareDialog();
      });

      handle.onAuthFailed((reason: string) => {
        statusEl.textContent = copy.authenticationFailed(reason);
        connectBtn.disabled = false;
        connectBtn.textContent = copy.connect;
        answerTextarea.value = '';
        answerTextarea.readOnly = false;
        flowController.handleAuthFailure();
      });

      if (mobileApi) {
        mobileSection.classList.remove('hidden');
        await flowController.generateMobilePairing();
      }
    } catch (err) {
      clearPendingMobilePairing(true);
      const pendingShareSessionId = getPendingShareSessionId();
      if (pendingShareSessionId && isSharing(pendingShareSessionId)) {
        endShare(pendingShareSessionId);
      }
      setPendingShareSessionId(null);
      flowController.setShareHandshake(null, null);
      statusEl.textContent = copy.errorWithReason(err instanceof Error ? err.message : copy.unknownError);
      startBtn.disabled = false;
      startBtn.textContent = copy.startSharing;
    }
  });
}
