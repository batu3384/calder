import { acceptShareAnswer } from '../../sharing/share-manager.js';
import type { ShareDialogCopy } from './share-dialog-copy.js';

export interface SubmitShareDialogAnswerParams {
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

export async function submitShareDialogAnswer(
  params: SubmitShareDialogAnswerParams,
): Promise<void> {
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
