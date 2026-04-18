// Share dialog — host-side UI for sharing a session via P2P.

import QRCode from 'qrcode';
import type { ShareMode } from '../../shared/sharing-types.js';
import type { ShareRtcConfig } from '../../shared/types.js';
import { shareSession, acceptShareAnswer, endShare } from '../sharing/share-manager.js';
import { isSharing, isConnected } from '../sharing/peer-host.js';
import { generatePassphrase, validateSharePassphrase } from '../sharing/share-crypto.js';
import { createPassphraseInput } from '../dom-utils.js';
import { appState } from '../state.js';

let activeOverlay: HTMLElement | null = null;
let pendingShareSessionId: string | null = null;
let pendingMobilePairingId: string | null = null;
let mobileAnswerPollTimer: ReturnType<typeof setTimeout> | null = null;

const MOBILE_ANSWER_POLL_MS = 1250;

interface MobileControlPairingResult {
  pairingId: string;
  pairingUrl: string;
  localPairingUrl: string;
  accessMode: 'lan' | 'remote';
  otpCode: string;
  expiresAt: string;
}

interface MobileControlAnswerResult {
  answer: string | null;
  status: 'pending' | 'ready' | 'expired';
}

interface MobileControlApi {
  createControlPairing(
    sessionId: string,
    offer: string,
    passphrase: string,
    mode: ShareMode,
  ): Promise<MobileControlPairingResult>;
  consumeControlAnswer(pairingId: string): Promise<MobileControlAnswerResult>;
  revokeControlPairing(pairingId: string): Promise<{ ok: boolean }>;
}

interface SharingConfigApi {
  getRtcConfig(): Promise<ShareRtcConfig>;
}

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

function stopMobileAnswerPolling(): void {
  if (mobileAnswerPollTimer) {
    clearTimeout(mobileAnswerPollTimer);
    mobileAnswerPollTimer = null;
  }
}

function clearPendingMobilePairing(revoke: boolean): void {
  stopMobileAnswerPolling();
  const pairingId = pendingMobilePairingId;
  pendingMobilePairingId = null;
  if (!revoke || !pairingId) return;
  const mobileApi = getMobileControlApi();
  const sharingConfigApi = getSharingConfigApi();
  if (!mobileApi) return;
  void mobileApi.revokeControlPairing(pairingId).catch(() => {});
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard not available');
  }
  await navigator.clipboard.writeText(text);
}

function formatOtpForDisplay(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  if (digits.length < 4) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

async function createQrDataUrl(value: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(value, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#E8F0FF',
        light: '#00000000',
      },
    });
  } catch {
    return null;
  }
}

export function showShareDialog(sessionId: string): void {
  closeShareDialog();
  clearPendingMobilePairing(true);

  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  activeOverlay = overlay;

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog modal-surface share-dialog-shell';

  let selectedMode: ShareMode = 'readonly';
  const mobileApi = getMobileControlApi();

  const hero = document.createElement('div');
  hero.className = 'share-dialog-hero';

  const kicker = document.createElement('div');
  kicker.className = 'share-dialog-kicker shell-kicker';
  kicker.textContent = 'P2P Session';

  const title = document.createElement('h3');
  title.className = 'share-dialog-title';
  title.textContent = 'Share Session';

  const copy = document.createElement('div');
  copy.className = 'share-dialog-copy';
  copy.textContent = 'Open a secure peer-to-peer handoff, choose the access level, and guide the other person through the connection flow.';

  hero.appendChild(kicker);
  hero.appendChild(title);
  hero.appendChild(copy);

  const project = appState.projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  if (project?.projectTeamContext && (project.projectTeamContext.spaces.length > 0 || project.projectTeamContext.sharedRuleCount > 0 || project.projectTeamContext.workflowCount > 0)) {
    const collaborationNote = document.createElement('div');
    collaborationNote.className = 'share-notice calder-inline-notice';
    collaborationNote.textContent = `Shared team context: ${project.projectTeamContext.spaces.length} spaces · ${project.projectTeamContext.sharedRuleCount} shared rules · ${project.projectTeamContext.workflowCount} workflows.`;
    hero.appendChild(collaborationNote);
  }
  dialog.appendChild(hero);

  // ── Phase 1: Permission + Disclaimers ──

  const phase1 = document.createElement('div');
  phase1.className = 'share-phase';

  const notice = document.createElement('div');
  notice.className = 'share-notice calder-inline-notice';
  notice.textContent = 'Your full terminal scrollback history will be shared with the peer.';
  phase1.appendChild(notice);

  const rwWarning = document.createElement('div');
  rwWarning.className = 'share-notice calder-inline-notice hidden';
  rwWarning.textContent = 'Read-write mode allows the peer to type into your terminal and execute commands. Only share with people you trust.';
  phase1.appendChild(rwWarning);

  const modeSection = document.createElement('div');
  modeSection.className = 'share-section';

  const modeLabel = document.createElement('div');
  modeLabel.className = 'share-label';
  modeLabel.textContent = 'Access level';
  modeSection.appendChild(modeLabel);

  const modeGroup = document.createElement('div');
  modeGroup.className = 'share-radio-group';

  const readonlyRadio = createRadio('share-mode', 'readonly', 'Read-only', true);
  const readwriteRadio = createRadio('share-mode', 'readwrite', 'Read-write', false);
  modeGroup.appendChild(readonlyRadio);
  modeGroup.appendChild(readwriteRadio);
  modeSection.appendChild(modeGroup);

  modeGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value as ShareMode;
    selectedMode = value;
    rwWarning.classList.toggle('hidden', value !== 'readwrite');
  });

  phase1.appendChild(modeSection);
  if (mobileApi) {
    const mobileDiscoverabilityNotice = document.createElement('div');
    mobileDiscoverabilityNotice.className = 'share-notice calder-inline-notice';
    mobileDiscoverabilityNotice.textContent = 'Start Sharing to generate a secure mobile QR and one-time code.';
    phase1.appendChild(mobileDiscoverabilityNotice);
  }
  dialog.appendChild(phase1);

  // ── Phase 2: Passphrase + Codes ──

  const phase2 = document.createElement('div');
  phase2.className = 'share-phase hidden';

  const pinSection = document.createElement('div');
  pinSection.className = 'share-section';

  const passphraseLabel = document.createElement('div');
  passphraseLabel.className = 'share-label';
  passphraseLabel.textContent = 'Share this one-time passphrase with your peer';

  const passphraseHint = document.createElement('div');
  passphraseHint.className = 'share-notice calder-inline-notice';
  passphraseHint.textContent = 'Generated passphrases are stronger than short numeric PINs and work best when copied as-is.';

  const passphraseInput = createPassphraseInput({
    placeholder: 'One-time passphrase',
    value: generatePassphrase(),
  });
  pinSection.appendChild(passphraseLabel);
  pinSection.appendChild(passphraseHint);
  pinSection.appendChild(passphraseInput);
  phase2.appendChild(pinSection);

  const manualToggleRow = document.createElement('div');
  manualToggleRow.className = 'share-manual-toggle-row';
  const manualToggleBtn = document.createElement('button');
  manualToggleBtn.type = 'button';
  manualToggleBtn.className = 'share-btn share-btn-secondary calder-button';
  manualToggleBtn.textContent = 'Show Manual Codes';
  manualToggleRow.appendChild(manualToggleBtn);
  phase2.appendChild(manualToggleRow);

  const manualSection = document.createElement('div');
  manualSection.className = 'share-manual-section hidden';

  // Offer code (manual fallback)
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section hidden';

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label';
  offerLabel.textContent = 'Send this code to your peer';
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.readOnly = true;
  offerTextarea.rows = 3;
  offerSection.appendChild(offerTextarea);

  const copyOfferBtn = document.createElement('button');
  copyOfferBtn.className = 'share-btn share-btn-secondary calder-button';
  copyOfferBtn.textContent = 'Copy Code';
  copyOfferBtn.addEventListener('click', () => {
    void copyToClipboard(offerTextarea.value)
      .then(() => {
        copyOfferBtn.textContent = 'Copied!';
        setTimeout(() => { copyOfferBtn.textContent = 'Copy Code'; }, 1500);
      })
      .catch(() => {
        copyOfferBtn.textContent = 'Copy failed';
        setTimeout(() => { copyOfferBtn.textContent = 'Copy Code'; }, 1800);
      });
  });
  offerSection.appendChild(copyOfferBtn);
  manualSection.appendChild(offerSection);

  // Answer code (manual fallback)
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = 'Paste your peer\'s response code';
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.rows = 3;
  answerTextarea.placeholder = 'Paste response code here...';
  answerSection.appendChild(answerTextarea);
  manualSection.appendChild(answerSection);
  phase2.appendChild(manualSection);

  const mobileSection = document.createElement('div');
  mobileSection.className = 'share-section share-mobile-section hidden';

  const mobileLabel = document.createElement('div');
  mobileLabel.className = 'share-label share-mobile-quick-label';
  mobileLabel.textContent = 'Quick handoff (Recommended)';
  mobileSection.appendChild(mobileLabel);

  const mobileHint = document.createElement('div');
  mobileHint.className = 'share-notice calder-inline-notice';
  mobileHint.textContent = 'Mobile handoff (QR + one-time code). Scan the QR with your phone, enter the desktop OTP, and Calder will auto-fill the response code.';
  mobileSection.appendChild(mobileHint);

  const mobileLinkRow = document.createElement('div');
  mobileLinkRow.className = 'share-mobile-link-row';
  const mobileLinkInput = document.createElement('input');
  mobileLinkInput.className = 'share-mobile-link';
  mobileLinkInput.type = 'text';
  mobileLinkInput.readOnly = true;
  mobileLinkInput.placeholder = 'Mobile pairing link';
  const copyMobileLinkBtn = document.createElement('button');
  copyMobileLinkBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileLinkBtn.textContent = 'Copy Link';
  copyMobileLinkBtn.addEventListener('click', () => {
    if (!mobileLinkInput.value.trim()) return;
    void copyToClipboard(mobileLinkInput.value)
      .then(() => {
        copyMobileLinkBtn.textContent = 'Copied!';
        setTimeout(() => { copyMobileLinkBtn.textContent = 'Copy Link'; }, 1500);
      })
      .catch(() => {
        copyMobileLinkBtn.textContent = 'Copy failed';
        setTimeout(() => { copyMobileLinkBtn.textContent = 'Copy Link'; }, 1800);
      });
  });
  mobileLinkRow.appendChild(mobileLinkInput);
  mobileLinkRow.appendChild(copyMobileLinkBtn);
  mobileSection.appendChild(mobileLinkRow);

  const mobileOtpRow = document.createElement('div');
  mobileOtpRow.className = 'share-mobile-otp-row';
  const mobileOtpBadge = document.createElement('div');
  mobileOtpBadge.className = 'share-mobile-otp';
  mobileOtpBadge.textContent = '------';
  const copyMobileOtpBtn = document.createElement('button');
  copyMobileOtpBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileOtpBtn.textContent = 'Copy OTP';
  copyMobileOtpBtn.addEventListener('click', () => {
    const rawOtp = mobileOtpBadge.textContent?.replace(/\s+/g, '') ?? '';
    if (!/^\d{6}$/.test(rawOtp)) return;
    void copyToClipboard(rawOtp)
      .then(() => {
        copyMobileOtpBtn.textContent = 'Copied!';
        setTimeout(() => { copyMobileOtpBtn.textContent = 'Copy OTP'; }, 1500);
      })
      .catch(() => {
        copyMobileOtpBtn.textContent = 'Copy failed';
        setTimeout(() => { copyMobileOtpBtn.textContent = 'Copy OTP'; }, 1800);
      });
  });
  mobileOtpRow.appendChild(mobileOtpBadge);
  mobileOtpRow.appendChild(copyMobileOtpBtn);
  mobileSection.appendChild(mobileOtpRow);

  const mobileQrWrap = document.createElement('div');
  mobileQrWrap.className = 'share-mobile-qr-wrap';
  const mobileQrImg = document.createElement('img');
  mobileQrImg.className = 'share-mobile-qr';
  mobileQrImg.alt = 'Mobile control QR code';
  mobileQrWrap.appendChild(mobileQrImg);
  mobileSection.appendChild(mobileQrWrap);

  const mobileStatusRow = document.createElement('div');
  mobileStatusRow.className = 'share-mobile-status-row';

  const mobileStatus = document.createElement('div');
  mobileStatus.className = 'share-mobile-status';
  mobileStatus.textContent = 'Mobile handoff is waiting for a pairing code.';
  mobileStatusRow.appendChild(mobileStatus);

  const retryMobilePairingBtn = document.createElement('button');
  retryMobilePairingBtn.type = 'button';
  retryMobilePairingBtn.className = 'share-btn share-btn-secondary calder-button share-mobile-retry hidden';
  retryMobilePairingBtn.textContent = 'Retry QR';
  mobileStatusRow.appendChild(retryMobilePairingBtn);
  mobileSection.appendChild(mobileStatusRow);

  phase2.appendChild(mobileSection);
  dialog.appendChild(phase2);

  // Status area
  const statusEl = document.createElement('div');
  statusEl.className = 'share-status';
  dialog.appendChild(statusEl);

  // ── Action buttons (always at bottom) ──

  const actions = document.createElement('div');
  actions.className = 'share-actions share-actions-shell';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'share-btn share-btn-secondary calder-button';
  closeBtn.textContent = 'Cancel';
  closeBtn.addEventListener('click', closeShareDialog);

  const backBtn = document.createElement('button');
  backBtn.className = 'share-btn share-btn-secondary calder-button hidden';
  backBtn.textContent = 'Back';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'share-btn calder-button';
  nextBtn.textContent = 'Next';

  const startBtn = document.createElement('button');
  startBtn.className = 'share-btn calder-button hidden';
  startBtn.textContent = 'Start Sharing';

  const connectBtn = document.createElement('button');
  connectBtn.className = 'share-btn calder-button hidden';
  connectBtn.textContent = 'Connect';
  connectBtn.disabled = true;

  actions.appendChild(closeBtn);
  actions.appendChild(backBtn);
  actions.appendChild(nextBtn);
  actions.appendChild(startBtn);
  actions.appendChild(connectBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ── Phase navigation ──

  nextBtn.addEventListener('click', () => {
    phase1.classList.add('hidden');
    phase2.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    backBtn.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    passphraseInput.focus();
  });

  backBtn.addEventListener('click', () => {
    phase2.classList.add('hidden');
    phase1.classList.remove('hidden');
    backBtn.classList.add('hidden');
    startBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    statusEl.textContent = '';
  });

  // Enable Connect only when answer code is entered
  answerTextarea.addEventListener('input', () => {
    connectBtn.disabled = !String(answerTextarea.value ?? '').trim();
  });

  let manualFallbackVisible = !mobileApi;
  let currentShareOffer: string | null = null;
  let currentSharePassphrase: string | null = null;

  const setManualFallbackVisible = (visible: boolean): void => {
    manualFallbackVisible = visible;
    manualSection.classList.toggle('hidden', !visible);
    manualToggleBtn.textContent = visible ? 'Hide Manual Codes' : 'Show Manual Codes';
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

  const setMobileStatus = (text: string, kind: 'info' | 'success' | 'error' = 'info') => {
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

  const submitAnswer = async (answer: string, source: 'manual' | 'mobile') => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    if (source === 'manual') {
      clearPendingMobilePairing(true);
      setMobileStatus('Manual response code detected. Mobile pairing stopped.');
    }
    try {
      await acceptShareAnswer(sessionId, trimmed);
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      answerTextarea.readOnly = true;
      statusEl.textContent = 'Establishing connection...';
      if (source === 'mobile') {
        setMobileStatus('Mobile response received. Completing secure handshake…', 'success');
      }
    } catch (err) {
      statusEl.textContent = err instanceof Error ? err.message : 'Invalid response code';
      answerTextarea.readOnly = false;
      connectBtn.disabled = !answerTextarea.value.trim();
      connectBtn.textContent = 'Connect';
      if (source === 'mobile') {
        setMobileStatus('Mobile response was received but failed to validate. Try manual connect.', 'error');
      }
    }
  };

  const generateMobilePairing = async (): Promise<void> => {
    if (!mobileApi || !currentShareOffer || !currentSharePassphrase || activeOverlay !== overlay) return;
    setRetryVisibility(false);
    setMobileStatus('Generating mobile pairing...');
    clearPendingMobilePairing(true);
    try {
      const pairing = await mobileApi.createControlPairing(
        sessionId,
        currentShareOffer,
        currentSharePassphrase,
        selectedMode,
      );
      if (activeOverlay !== overlay) {
        void mobileApi.revokeControlPairing(pairing.pairingId).catch(() => {});
        return;
      }
      pendingMobilePairingId = pairing.pairingId;
      mobileLinkInput.value = pairing.pairingUrl;
      mobileOtpBadge.textContent = formatOtpForDisplay(pairing.otpCode);
      const qrDataUrl = await createQrDataUrl(pairing.pairingUrl);
      if (qrDataUrl) {
        mobileQrImg.src = qrDataUrl;
        mobileQrImg.classList.remove('hidden');
      } else {
        mobileQrImg.classList.add('hidden');
      }
      const expiresAt = new Date(pairing.expiresAt);
      const expiresLabel = Number.isNaN(expiresAt.getTime()) ? 'soon' : expiresAt.toLocaleTimeString();
      const modeLabel = pairing.accessMode === 'remote' ? 'Remote mode active.' : 'LAN mode active.';
      setMobileStatus(`${modeLabel} Scan QR and enter OTP before ${expiresLabel}.`, 'success');
      startMobileAnswerPolling();
    } catch (error) {
      setManualFallbackVisible(true);
      setRetryVisibility(true);
      setMobileStatus(
        error instanceof Error
          ? `Mobile handoff failed: ${error.message}. Use Manual Codes or retry QR.`
          : 'Mobile handoff failed right now. Use Manual Codes or retry QR.',
        'error',
      );
    }
  };

  const pollMobileAnswer = async () => {
    if (!mobileApi || !pendingMobilePairingId || activeOverlay !== overlay) return;
    try {
      const result = await mobileApi.consumeControlAnswer(pendingMobilePairingId);
      if (result.status === 'ready' && result.answer) {
        pendingMobilePairingId = null;
        stopMobileAnswerPolling();
        answerTextarea.value = result.answer;
        connectBtn.disabled = false;
        await submitAnswer(result.answer, 'mobile');
        return;
      }
      if (result.status === 'expired') {
        pendingMobilePairingId = null;
        stopMobileAnswerPolling();
        setRetryVisibility(true);
        setManualFallbackVisible(true);
        setMobileStatus('Mobile pairing expired. Retry QR or continue with Manual Codes.', 'error');
        return;
      }
    } catch {
      setRetryVisibility(true);
      setMobileStatus('Mobile pairing check failed. Retry QR or continue with Manual Codes.', 'error');
    }
    if (pendingMobilePairingId && activeOverlay === overlay) {
      mobileAnswerPollTimer = setTimeout(() => {
        void pollMobileAnswer();
      }, MOBILE_ANSWER_POLL_MS);
    }
  };

  const startMobileAnswerPolling = () => {
    if (!pendingMobilePairingId) return;
    stopMobileAnswerPolling();
    mobileAnswerPollTimer = setTimeout(() => {
      void pollMobileAnswer();
    }, MOBILE_ANSWER_POLL_MS);
  };

  // Connect handler (registered once, guarded by disabled state)
  connectBtn.addEventListener('click', async () => {
    const answer = String(answerTextarea.value ?? '').trim();
    if (!answer) return;
    await submitAnswer(answer, 'manual');
  });

  retryMobilePairingBtn.addEventListener('click', () => {
    retryMobilePairingBtn.disabled = true;
    void generateMobilePairing().finally(() => {
      if (!retryMobilePairingBtn.classList.contains('hidden')) {
        retryMobilePairingBtn.disabled = false;
      }
    });
  });

  // ── Handle Escape ──

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeShareDialog();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeShareDialog();
  });

  // ── Start sharing flow ──

  startBtn.addEventListener('click', async () => {
    const passphrase = String(passphraseInput.value ?? '').trim();
    const passphraseError = validateSharePassphrase(passphrase);
    if (passphraseError) {
      statusEl.textContent = passphraseError;
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Generating code...';
    statusEl.textContent = 'Generating connection code...';

    pendingShareSessionId = sessionId;

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
        ? await shareSession(sessionId, selectedMode, passphrase, rtcConfig)
        : await shareSession(sessionId, selectedMode, passphrase);
      const { offer, handle } = shareResult;

      passphraseInput.readOnly = true;
      passphraseLabel.textContent = 'Share this passphrase with your peer';
      offerTextarea.value = offer;
      offerSection.classList.remove('hidden');
      answerSection.classList.remove('hidden');
      currentShareOffer = offer;
      currentSharePassphrase = passphrase;
      startBtn.classList.add('hidden');
      backBtn.classList.add('hidden');
      connectBtn.classList.remove('hidden');
      statusEl.textContent = 'Waiting for peer to connect...';
      if (rtcConfig?.iceTransportPolicy === 'relay') {
        statusEl.textContent = 'Waiting for peer to connect... (TURN relay mode active)';
      }
      setManualFallbackVisible(!mobileApi);

      handle.onConnected(() => {
        closeShareDialog();
      });

      handle.onAuthFailed((reason: string) => {
        statusEl.textContent = `Authentication failed: ${reason}`;
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
        answerTextarea.value = '';
        answerTextarea.readOnly = false;
        setManualFallbackVisible(true);
        setRetryVisibility(true);
        setMobileStatus('Authentication failed. Restart sharing for a new secure handoff.', 'error');
      });

      if (mobileApi) {
        mobileSection.classList.remove('hidden');
        await generateMobilePairing();
      }
    } catch (err) {
      clearPendingMobilePairing(true);
      if (pendingShareSessionId && isSharing(pendingShareSessionId)) {
        endShare(pendingShareSessionId);
      }
      pendingShareSessionId = null;
      currentShareOffer = null;
      currentSharePassphrase = null;
      statusEl.textContent = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      startBtn.disabled = false;
      startBtn.textContent = 'Start Sharing';
    }
  });
}

export function closeShareDialog(): void {
  clearPendingMobilePairing(true);
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (pendingShareSessionId && isSharing(pendingShareSessionId) && !isConnected(pendingShareSessionId)) {
    endShare(pendingShareSessionId);
  }
  pendingShareSessionId = null;
}

function createRadio(name: string, value: string, labelText: string, checked: boolean): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'share-radio-label';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = labelText;
  wrapper.appendChild(input);
  wrapper.appendChild(span);
  return wrapper;
}
