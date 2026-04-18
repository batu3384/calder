// Share dialog — host-side UI for sharing a session via P2P.

import QRCode from 'qrcode';
import type { ShareMode } from '../../shared/sharing-types.js';
import type { MobileControlPairingResult, ShareConnectionDescription, ShareRtcConfig, UiLanguage } from '../../shared/types.js';
import { shareSession, acceptShareAnswer, endShare } from '../sharing/share-manager.js';
import { getShareConnectionSnapshot, isSharing, isConnected } from '../sharing/peer-host.js';
import { generatePassphrase, validateSharePassphrase } from '../sharing/share-crypto.js';
import { decodeConnectionEnvelope } from '../sharing/webrtc-utils.js';
import { createPassphraseInput } from '../dom-utils.js';
import { appState } from '../state.js';

let activeOverlay: HTMLElement | null = null;
let pendingShareSessionId: string | null = null;
let pendingMobilePairingId: string | null = null;
let mobileAnswerPollTimer: ReturnType<typeof setTimeout> | null = null;
let mobilePresenceRefreshTimer: ReturnType<typeof setInterval> | null = null;

const MOBILE_ANSWER_POLL_MS = 1250;

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
    language?: UiLanguage,
    offerDescription?: ShareConnectionDescription,
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

type ShareDialogLanguage = 'en' | 'tr';

type ShareDialogCopy = {
  heroKicker: string;
  heroTitle: string;
  heroCopy: string;
  mobileConnectionSummary: (stateLabel: string) => string;
  mobileConnectionStateConnected: string;
  mobileConnectionStateWaiting: string;
  mobileConnectionStateIdle: string;
  mobileConnectionMetaConnected: (sessionName: string, modeLabel: string, durationLabel: string) => string;
  mobileConnectionMetaWaiting: string;
  sharedTeamContext: (spaces: number, rules: number, workflows: number) => string;
  historyNotice: string;
  readWriteWarning: string;
  accessLevel: string;
  readOnly: string;
  readWrite: string;
  mobileDiscoverabilityNotice: string;
  passphraseLabel: string;
  passphraseHint: string;
  oneTimePassphrasePlaceholder: string;
  showManualCodes: string;
  hideManualCodes: string;
  offerLabel: string;
  answerLabel: string;
  answerPlaceholder: string;
  copyButton: string;
  quickHandoffRecommended: string;
  mobileHandoffHint: string;
  quickHandoffStepsLabel: string;
  quickHandoffStepScan: string;
  quickHandoffStepOtp: string;
  quickHandoffStepAuto: string;
  manualCodesHint: string;
  otpLabel: string;
  otpUsageHint: (otp: string) => string;
  mobilePairingLinkPlaceholder: string;
  copyLink: string;
  lanFallbackLinkPlaceholder: string;
  useFallback: string;
  copyFallback: string;
  copyOtp: string;
  mobileControlQrAlt: string;
  waitingPairingCode: string;
  retryQr: string;
  cancel: string;
  back: string;
  next: string;
  startSharing: string;
  connect: string;
  copied: string;
  copyFailed: string;
  usingLanFallback: string;
  manualResponseDetected: string;
  connecting: string;
  establishingConnection: string;
  mobileResponseReceived: string;
  invalidResponseCode: string;
  mobileResponseValidationFailed: string;
  generatingMobilePairing: string;
  soon: string;
  remoteModeActive: string;
  lanModeActive: string;
  scanQrBefore: (expiresLabel: string) => string;
  mobileHandoffFailedWithReason: (reason: string) => string;
  mobileHandoffFailedFallback: string;
  mobilePairingExpired: string;
  mobilePairingCheckFailedRepeated: string;
  mobilePairingCheckFailedRetrying: string;
  generatingCode: string;
  generatingConnectionCode: string;
  waitingForPeer: string;
  waitingForPeerTurn: string;
  authenticationFailed: (reason: string) => string;
  authenticationFailedRestart: string;
  unknownError: string;
  errorWithReason: (reason: string) => string;
  qrUnavailableUseLink: string;
};

function resolveShareDialogLanguage(language: UiLanguage | undefined): ShareDialogLanguage {
  return language === 'tr' ? 'tr' : 'en';
}

function getShareDialogCopy(language: ShareDialogLanguage): ShareDialogCopy {
  if (language === 'tr') {
    return {
      heroKicker: 'P2P Oturumu',
      heroTitle: 'Oturum Paylaş',
      heroCopy: 'Güvenli bir eşler arası devir başlatın, erişim seviyesini seçin ve diğer kişiyi bağlantı akışında yönlendirin.',
      mobileConnectionSummary: (stateLabel) => `Mobil kontrol durumu: ${stateLabel}`,
      mobileConnectionStateConnected: 'Aktif bağlantı var',
      mobileConnectionStateWaiting: 'Paylaşım açık, bağlantı bekleniyor',
      mobileConnectionStateIdle: 'Aktif mobil bağlantı yok',
      mobileConnectionMetaConnected: (sessionName, modeLabel, durationLabel) => `Aktif oturum: ${sessionName} · Mod: ${modeLabel} · Süre: ${durationLabel}`,
      mobileConnectionMetaWaiting: 'Güvenli doğrulama bekleniyor...',
      sharedTeamContext: (spaces, rules, workflows) => `Paylaşılan ekip bağlamı: ${spaces} alan · ${rules} paylaşılan kural · ${workflows} iş akışı.`,
      historyNotice: 'Terminal geçmişinizin tamamı karşı tarafla paylaşılacaktır.',
      readWriteWarning: 'Okuma-yazma modu karşı tarafın terminalinize yazmasına ve komut çalıştırmasına izin verir. Sadece güvendiğiniz kişilerle paylaşın.',
      accessLevel: 'Erişim seviyesi',
      readOnly: 'Salt okunur',
      readWrite: 'Okuma-yazma',
      mobileDiscoverabilityNotice: 'Güvenli mobil QR ve tek kullanımlık kod üretmek için Paylaşımı Başlat\'a tıklayın.',
      passphraseLabel: 'Manuel Kodlar için güvenlik parolası',
      passphraseHint: 'Bu alan sadece Manuel Kodlar akışında kullanılır.',
      oneTimePassphrasePlaceholder: 'Tek kullanımlık parola',
      showManualCodes: 'Manuel Kodları Göster',
      hideManualCodes: 'Manuel Kodları Gizle',
      offerLabel: 'Bu kodu karşı tarafa gönderin',
      answerLabel: 'Karşı tarafın yanıt kodunu yapıştırın',
      answerPlaceholder: 'Yanıt kodunu buraya yapıştırın...',
      copyButton: 'Kodu Kopyala',
      quickHandoffRecommended: 'Hızlı devir (Önerilen)',
      mobileHandoffHint: 'Mobil devir (QR + tek kullanımlık kod). Parola girmenize gerek yok; sadece QR + OTP yeterlidir.',
      quickHandoffStepsLabel: 'Hızlı eşleştirme adımları',
      quickHandoffStepScan: 'Telefonla QR\'ı okutun veya bağlantıyı açın.',
      quickHandoffStepOtp: 'Telefon ekranına masaüstündeki 6 haneli OTP\'yi girin.',
      quickHandoffStepAuto: 'Yanıt kodu otomatik alınır; elle kod yapıştırmanız gerekmez.',
      manualCodesHint: 'Manuel Kodlar sadece hızlı eşleştirme başarısız olursa gerekir.',
      otpLabel: 'Telefon OTP',
      otpUsageHint: (otp) => `Telefonda bu kodu girin: ${otp}`,
      mobilePairingLinkPlaceholder: 'Mobil eşleştirme bağlantısı',
      copyLink: 'Bağlantıyı Kopyala',
      lanFallbackLinkPlaceholder: 'LAN yedek bağlantısı',
      useFallback: 'Yedeği Kullan',
      copyFallback: 'Yedeği Kopyala',
      copyOtp: 'OTP Kopyala',
      mobileControlQrAlt: 'Mobil kontrol QR kodu',
      waitingPairingCode: 'Mobil devir bir eşleştirme kodu bekliyor.',
      retryQr: 'QR\'ı Tekrar Dene',
      cancel: 'İptal',
      back: 'Geri',
      next: 'İleri',
      startSharing: 'Paylaşımı Başlat',
      connect: 'Bağlan',
      copied: 'Kopyalandı!',
      copyFailed: 'Kopyalama başarısız',
      usingLanFallback: 'QR ve kopyalama işlemleri için LAN yedek bağlantısı kullanılıyor.',
      manualResponseDetected: 'Manuel yanıt kodu algılandı. Mobil eşleştirme durduruldu.',
      connecting: 'Bağlanıyor...',
      establishingConnection: 'Bağlantı kuruluyor...',
      mobileResponseReceived: 'Mobil yanıt alındı. Güvenli el sıkışma tamamlanıyor…',
      invalidResponseCode: 'Geçersiz yanıt kodu',
      mobileResponseValidationFailed: 'Mobil yanıt alındı ancak doğrulanamadı. Manuel bağlanmayı deneyin.',
      generatingMobilePairing: 'Mobil eşleştirme oluşturuluyor...',
      soon: 'yakında',
      remoteModeActive: 'Uzak mod aktif.',
      lanModeActive: 'LAN modu aktif.',
      scanQrBefore: (expiresLabel) => `QR\'ı okutun ve ${expiresLabel} öncesinde OTP\'yi girin.`,
      mobileHandoffFailedWithReason: (reason) => `Mobil devir başarısız: ${reason}. Manuel Kodları kullanın veya QR\'ı tekrar deneyin.`,
      mobileHandoffFailedFallback: 'Mobil devir şu anda başarısız. Manuel Kodları kullanın veya QR\'ı tekrar deneyin.',
      mobilePairingExpired: 'Mobil eşleştirmenin süresi doldu. QR\'ı tekrar deneyin veya Manuel Kodlarla devam edin.',
      mobilePairingCheckFailedRepeated: 'Mobil eşleştirme kontrolü art arda başarısız oldu. Manuel Kodlarla devam edin veya QR\'ı tekrar deneyin.',
      mobilePairingCheckFailedRetrying: 'Mobil eşleştirme kontrolü başarısız oldu. Otomatik olarak yeniden deneniyor…',
      generatingCode: 'Kod oluşturuluyor...',
      generatingConnectionCode: 'Bağlantı kodu oluşturuluyor...',
      waitingForPeer: 'Karşı tarafın bağlanması bekleniyor...',
      waitingForPeerTurn: 'Karşı tarafın bağlanması bekleniyor... (TURN relay modu aktif)',
      authenticationFailed: (reason) => `Kimlik doğrulama başarısız: ${reason}`,
      authenticationFailedRestart: 'Kimlik doğrulama başarısız. Yeni güvenli devir için paylaşımı yeniden başlatın.',
      unknownError: 'Bilinmeyen hata',
      errorWithReason: (reason) => `Hata: ${reason}`,
      qrUnavailableUseLink: 'QR üretilemedi. Bağlantıyı kopyalayarak manuel açın.',
    };
  }

  return {
    heroKicker: 'P2P Session',
    heroTitle: 'Share Session',
    heroCopy: 'Open a secure peer-to-peer handoff, choose the access level, and guide the other person through the connection flow.',
    mobileConnectionSummary: (stateLabel) => `Mobile control status: ${stateLabel}`,
    mobileConnectionStateConnected: 'Connected',
    mobileConnectionStateWaiting: 'Sharing active, waiting for connection',
    mobileConnectionStateIdle: 'No active mobile connection',
    mobileConnectionMetaConnected: (sessionName, modeLabel, durationLabel) => `Active session: ${sessionName} · Mode: ${modeLabel} · Duration: ${durationLabel}`,
    mobileConnectionMetaWaiting: 'Waiting for secure authentication...',
    sharedTeamContext: (spaces, rules, workflows) => `Shared team context: ${spaces} spaces · ${rules} shared rules · ${workflows} workflows.`,
    historyNotice: 'Your full terminal scrollback history will be shared with the peer.',
    readWriteWarning: 'Read-write mode allows the peer to type into your terminal and execute commands. Only share with people you trust.',
    accessLevel: 'Access level',
    readOnly: 'Read-only',
    readWrite: 'Read-write',
    mobileDiscoverabilityNotice: 'Start Sharing to generate a secure mobile QR and one-time code.',
    passphraseLabel: 'Security passphrase for Manual Codes',
    passphraseHint: 'This field is only used in the Manual Codes fallback flow.',
    oneTimePassphrasePlaceholder: 'One-time passphrase',
    showManualCodes: 'Show Manual Codes',
    hideManualCodes: 'Hide Manual Codes',
    offerLabel: 'Send this code to your peer',
    answerLabel: 'Paste your peer\'s response code',
    answerPlaceholder: 'Paste response code here...',
    copyButton: 'Copy Code',
    quickHandoffRecommended: 'Quick handoff (Recommended)',
    mobileHandoffHint: 'Mobile handoff (QR + one-time code). No passphrase entry is required on phone; QR + OTP is enough.',
    quickHandoffStepsLabel: 'Quick pairing steps',
    quickHandoffStepScan: 'Scan the QR with your phone or open the pairing link.',
    quickHandoffStepOtp: 'Enter the 6-digit OTP shown on desktop into your phone.',
    quickHandoffStepAuto: 'Calder fetches the response code automatically. No manual paste needed.',
    manualCodesHint: 'Use Manual Codes only if quick handoff fails.',
    otpLabel: 'Phone OTP',
    otpUsageHint: (otp) => `Enter this code on phone: ${otp}`,
    mobilePairingLinkPlaceholder: 'Mobile pairing link',
    copyLink: 'Copy Link',
    lanFallbackLinkPlaceholder: 'LAN fallback link',
    useFallback: 'Use fallback',
    copyFallback: 'Copy fallback',
    copyOtp: 'Copy OTP',
    mobileControlQrAlt: 'Mobile control QR code',
    waitingPairingCode: 'Mobile handoff is waiting for a pairing code.',
    retryQr: 'Retry QR',
    cancel: 'Cancel',
    back: 'Back',
    next: 'Next',
    startSharing: 'Start Sharing',
    connect: 'Connect',
    copied: 'Copied!',
    copyFailed: 'Copy failed',
    usingLanFallback: 'Using LAN fallback link for QR and copy actions.',
    manualResponseDetected: 'Manual response code detected. Mobile pairing stopped.',
    connecting: 'Connecting...',
    establishingConnection: 'Establishing connection...',
    mobileResponseReceived: 'Mobile response received. Completing secure handshake…',
    invalidResponseCode: 'Invalid response code',
    mobileResponseValidationFailed: 'Mobile response was received but failed to validate. Try manual connect.',
    generatingMobilePairing: 'Generating mobile pairing...',
    soon: 'soon',
    remoteModeActive: 'Remote mode active.',
    lanModeActive: 'LAN mode active.',
    scanQrBefore: (expiresLabel) => `Scan QR and enter OTP before ${expiresLabel}.`,
    mobileHandoffFailedWithReason: (reason) => `Mobile handoff failed: ${reason}. Use Manual Codes or retry QR.`,
    mobileHandoffFailedFallback: 'Mobile handoff failed right now. Use Manual Codes or retry QR.',
    mobilePairingExpired: 'Mobile pairing expired. Retry QR or continue with Manual Codes.',
    mobilePairingCheckFailedRepeated: 'Mobile pairing check failed repeatedly. Continue with Manual Codes or retry QR.',
    mobilePairingCheckFailedRetrying: 'Mobile pairing check failed. Retrying automatically…',
    generatingCode: 'Generating code...',
    generatingConnectionCode: 'Generating connection code...',
    waitingForPeer: 'Waiting for peer to connect...',
    waitingForPeerTurn: 'Waiting for peer to connect... (TURN relay mode active)',
    authenticationFailed: (reason) => `Authentication failed: ${reason}`,
    authenticationFailedRestart: 'Authentication failed. Restart sharing for a new secure handoff.',
    unknownError: 'Unknown error',
    errorWithReason: (reason) => `Error: ${reason}`,
    qrUnavailableUseLink: 'Could not generate QR right now. Use Copy Link instead.',
  };
}

export type ShareDialogMobilePresenceCopy = Pick<
  ShareDialogCopy,
  | 'mobileConnectionSummary'
  | 'mobileConnectionStateConnected'
  | 'mobileConnectionStateWaiting'
  | 'mobileConnectionStateIdle'
  | 'mobileConnectionMetaConnected'
  | 'mobileConnectionMetaWaiting'
  | 'readOnly'
  | 'readWrite'
>;

export function getShareDialogMobilePresenceCopy(language: UiLanguage | undefined): ShareDialogMobilePresenceCopy {
  const normalizedLanguage = resolveShareDialogLanguage(language);
  const copy = getShareDialogCopy(normalizedLanguage);
  return {
    mobileConnectionSummary: copy.mobileConnectionSummary,
    mobileConnectionStateConnected: copy.mobileConnectionStateConnected,
    mobileConnectionStateWaiting: copy.mobileConnectionStateWaiting,
    mobileConnectionStateIdle: copy.mobileConnectionStateIdle,
    mobileConnectionMetaConnected: copy.mobileConnectionMetaConnected,
    mobileConnectionMetaWaiting: copy.mobileConnectionMetaWaiting,
    readOnly: copy.readOnly,
    readWrite: copy.readWrite,
  };
}

type ShareDialogMobilePresenceState = 'connected' | 'waiting' | 'idle';

export interface ShareDialogMobilePresenceView {
  state: ShareDialogMobilePresenceState;
  stateLabel: string;
  summaryText: string;
  metaText: string;
  modeLabel?: string;
  activeSessionName?: string;
  durationLabel?: string;
}

interface BuildShareDialogMobilePresenceOptions {
  sessionId: string;
  language: UiLanguage | undefined;
  resolveSessionName?: (sessionId: string, fallbackSessionId: string) => string;
  nowMs?: number;
}

export function buildShareDialogMobilePresence(
  options: BuildShareDialogMobilePresenceOptions,
): ShareDialogMobilePresenceView {
  const { sessionId, language, resolveSessionName: resolveSessionNameFn, nowMs = Date.now() } = options;
  const copy = getShareDialogMobilePresenceCopy(language);
  const mobileConnectedNow = isConnected(sessionId);
  const mobileSharingNow = isSharing(sessionId);
  const state: ShareDialogMobilePresenceState = mobileConnectedNow
    ? 'connected'
    : mobileSharingNow
      ? 'waiting'
      : 'idle';

  const stateLabel = state === 'connected'
    ? copy.mobileConnectionStateConnected
    : state === 'waiting'
      ? copy.mobileConnectionStateWaiting
      : copy.mobileConnectionStateIdle;
  const summaryText = copy.mobileConnectionSummary(stateLabel);

  const snapshot = getShareConnectionSnapshot(sessionId);
  if (snapshot && state === 'connected') {
    const activeSessionName = (resolveSessionNameFn ?? resolveSessionName)(snapshot.activeSessionId, snapshot.activeSessionId);
    const modeLabel = snapshot.mode === 'readwrite' ? copy.readWrite : copy.readOnly;
    const since = snapshot.verifiedAtMs ?? snapshot.connectedAtMs;
    const durationLabel = since
      ? formatShareConnectionDuration(nowMs - since, language)
      : formatShareConnectionDuration(0, language);
    return {
      state,
      stateLabel,
      summaryText,
      metaText: copy.mobileConnectionMetaConnected(activeSessionName, modeLabel, durationLabel),
      modeLabel,
      activeSessionName,
      durationLabel,
    };
  }

  if (snapshot && state === 'waiting') {
    return {
      state,
      stateLabel,
      summaryText,
      metaText: copy.mobileConnectionMetaWaiting,
    };
  }

  return {
    state,
    stateLabel,
    summaryText,
    metaText: '',
  };
}

function localizePassphraseError(error: string, language: ShareDialogLanguage): string {
  if (language !== 'tr') return error;

  if (/^Passphrase must be at least \d+ characters$/u.test(error)) {
    const size = error.match(/(\d+)/u)?.[1] ?? '12';
    return `Parola en az ${size} karakter olmalıdır`;
  }
  if (error === 'Passphrase may contain only letters, numbers, spaces, or hyphens') {
    return 'Parola yalnızca harf, sayı, boşluk veya tire içerebilir';
  }
  if (error === 'Passphrase must include both letters and numbers') {
    return 'Parola hem harf hem sayı içermelidir';
  }
  return error;
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

export function formatShareConnectionDuration(
  durationMs: number,
  language: UiLanguage | ShareDialogLanguage | undefined,
): string {
  const normalizedLanguage = language === 'tr' ? 'tr' : 'en';
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return normalizedLanguage === 'tr' ? 'şimdi' : 'just now';
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (normalizedLanguage === 'tr') {
    if (hours > 0) return `${hours}sa ${minutes}dk`;
    if (minutes > 0) return `${minutes}dk ${seconds}sn`;
    return `${seconds}sn`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function resolveSessionName(sessionId: string, fallbackSessionId: string): string {
  const project = appState.projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  const session = project?.sessions.find((entry) => entry.id === sessionId);
  return session?.name?.trim() || fallbackSessionId;
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

  // ── Phase 1: Permission + Disclaimers ──

  const phase1 = document.createElement('div');
  phase1.className = 'share-phase';

  const notice = document.createElement('div');
  notice.className = 'share-notice calder-inline-notice';
  notice.textContent = copy.historyNotice;
  phase1.appendChild(notice);

  const rwWarning = document.createElement('div');
  rwWarning.className = 'share-notice calder-inline-notice hidden';
  rwWarning.textContent = copy.readWriteWarning;
  phase1.appendChild(rwWarning);

  const modeSection = document.createElement('div');
  modeSection.className = 'share-section';

  const modeLabel = document.createElement('div');
  modeLabel.className = 'share-label';
  modeLabel.textContent = copy.accessLevel;
  modeSection.appendChild(modeLabel);

  const modeGroup = document.createElement('div');
  modeGroup.className = 'share-radio-group';

  const readonlyRadio = createRadio('share-mode', 'readonly', copy.readOnly, true);
  const readwriteRadio = createRadio('share-mode', 'readwrite', copy.readWrite, false);
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
    mobileDiscoverabilityNotice.textContent = copy.mobileDiscoverabilityNotice;
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
  passphraseLabel.textContent = copy.passphraseLabel;

  const passphraseHint = document.createElement('div');
  passphraseHint.className = 'share-passphrase-hint';
  passphraseHint.textContent = copy.passphraseHint;

  const passphraseInput = createPassphraseInput({
    placeholder: copy.oneTimePassphrasePlaceholder,
    value: generatePassphrase(),
  });
  pinSection.appendChild(passphraseLabel);
  pinSection.appendChild(passphraseHint);
  pinSection.appendChild(passphraseInput);

  const manualToggleRow = document.createElement('div');
  manualToggleRow.className = 'share-manual-toggle-row';
  const manualToggleBtn = document.createElement('button');
  manualToggleBtn.type = 'button';
  manualToggleBtn.className = 'share-btn share-btn-secondary calder-button';
  manualToggleBtn.textContent = copy.showManualCodes;
  manualToggleRow.appendChild(manualToggleBtn);
  phase2.appendChild(manualToggleRow);

  const manualHint = document.createElement('div');
  manualHint.className = 'share-manual-hint';
  manualHint.textContent = copy.manualCodesHint;
  phase2.appendChild(manualHint);

  const manualSection = document.createElement('div');
  manualSection.className = 'share-manual-section hidden';
  manualSection.appendChild(pinSection);

  // Offer code (manual fallback)
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section hidden';

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label';
  offerLabel.textContent = copy.offerLabel;
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.readOnly = true;
  offerTextarea.rows = 3;
  offerSection.appendChild(offerTextarea);

  const copyOfferBtn = document.createElement('button');
  copyOfferBtn.className = 'share-btn share-btn-secondary calder-button';
  copyOfferBtn.textContent = copy.copyButton;
  copyOfferBtn.addEventListener('click', () => {
    void copyToClipboard(offerTextarea.value)
      .then(() => {
        copyOfferBtn.textContent = copy.copied;
        setTimeout(() => { copyOfferBtn.textContent = copy.copyButton; }, 1500);
      })
      .catch(() => {
        copyOfferBtn.textContent = copy.copyFailed;
        setTimeout(() => { copyOfferBtn.textContent = copy.copyButton; }, 1800);
      });
  });
  offerSection.appendChild(copyOfferBtn);
  manualSection.appendChild(offerSection);

  // Answer code (manual fallback)
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = copy.answerLabel;
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.rows = 3;
  answerTextarea.placeholder = copy.answerPlaceholder;
  answerSection.appendChild(answerTextarea);
  manualSection.appendChild(answerSection);
  phase2.appendChild(manualSection);

  const mobileSection = document.createElement('div');
  mobileSection.className = 'share-section share-mobile-section hidden';

  const mobileLabel = document.createElement('div');
  mobileLabel.className = 'share-label share-mobile-quick-label';
  mobileLabel.textContent = copy.quickHandoffRecommended;
  mobileSection.appendChild(mobileLabel);

  const mobileHint = document.createElement('div');
  mobileHint.className = 'share-notice calder-inline-notice';
  mobileHint.textContent = copy.mobileHandoffHint;
  mobileSection.appendChild(mobileHint);

  const mobileStepsLabel = document.createElement('div');
  mobileStepsLabel.className = 'share-label share-mobile-steps-label';
  mobileStepsLabel.textContent = copy.quickHandoffStepsLabel;
  mobileSection.appendChild(mobileStepsLabel);

  const mobileSteps = document.createElement('ol');
  mobileSteps.className = 'share-mobile-steps';
  for (const step of [copy.quickHandoffStepScan, copy.quickHandoffStepOtp, copy.quickHandoffStepAuto]) {
    const item = document.createElement('li');
    item.textContent = step;
    mobileSteps.appendChild(item);
  }
  mobileSection.appendChild(mobileSteps);

  const mobileLinkRow = document.createElement('div');
  mobileLinkRow.className = 'share-mobile-link-row';
  const mobileLinkInput = document.createElement('input');
  mobileLinkInput.className = 'share-mobile-link';
  mobileLinkInput.type = 'text';
  mobileLinkInput.readOnly = true;
  mobileLinkInput.placeholder = copy.mobilePairingLinkPlaceholder;
  const copyMobileLinkBtn = document.createElement('button');
  copyMobileLinkBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileLinkBtn.textContent = copy.copyLink;
  copyMobileLinkBtn.addEventListener('click', () => {
    if (!mobileLinkInput.value.trim()) return;
    void copyToClipboard(mobileLinkInput.value)
      .then(() => {
        copyMobileLinkBtn.textContent = copy.copied;
        setTimeout(() => { copyMobileLinkBtn.textContent = copy.copyLink; }, 1500);
      })
      .catch(() => {
        copyMobileLinkBtn.textContent = copy.copyFailed;
        setTimeout(() => { copyMobileLinkBtn.textContent = copy.copyLink; }, 1800);
      });
  });
  mobileLinkRow.appendChild(mobileLinkInput);
  mobileLinkRow.appendChild(copyMobileLinkBtn);
  mobileSection.appendChild(mobileLinkRow);

  const mobileFallbackRow = document.createElement('div');
  mobileFallbackRow.className = 'share-mobile-link-row share-mobile-fallback-row hidden';
  const mobileFallbackInput = document.createElement('input');
  mobileFallbackInput.className = 'share-mobile-link';
  mobileFallbackInput.type = 'text';
  mobileFallbackInput.readOnly = true;
  mobileFallbackInput.placeholder = copy.lanFallbackLinkPlaceholder;

  const useMobileFallbackBtn = document.createElement('button');
  useMobileFallbackBtn.className = 'share-btn share-btn-secondary calder-button';
  useMobileFallbackBtn.textContent = copy.useFallback;

  const copyMobileFallbackBtn = document.createElement('button');
  copyMobileFallbackBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileFallbackBtn.textContent = copy.copyFallback;
  copyMobileFallbackBtn.addEventListener('click', () => {
    if (!mobileFallbackInput.value.trim()) return;
    void copyToClipboard(mobileFallbackInput.value)
      .then(() => {
        copyMobileFallbackBtn.textContent = copy.copied;
        setTimeout(() => { copyMobileFallbackBtn.textContent = copy.copyFallback; }, 1500);
      })
      .catch(() => {
        copyMobileFallbackBtn.textContent = copy.copyFailed;
        setTimeout(() => { copyMobileFallbackBtn.textContent = copy.copyFallback; }, 1800);
      });
  });
  mobileFallbackRow.appendChild(mobileFallbackInput);
  mobileFallbackRow.appendChild(useMobileFallbackBtn);
  mobileFallbackRow.appendChild(copyMobileFallbackBtn);
  mobileSection.appendChild(mobileFallbackRow);

  const mobileOtpRow = document.createElement('div');
  mobileOtpRow.className = 'share-mobile-otp-row';
  const mobileOtpLabel = document.createElement('div');
  mobileOtpLabel.className = 'share-label';
  mobileOtpLabel.textContent = copy.otpLabel;
  mobileSection.appendChild(mobileOtpLabel);
  const mobileOtpBadge = document.createElement('div');
  mobileOtpBadge.className = 'share-mobile-otp';
  mobileOtpBadge.textContent = '------';
  const copyMobileOtpBtn = document.createElement('button');
  copyMobileOtpBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileOtpBtn.textContent = copy.copyOtp;
  copyMobileOtpBtn.addEventListener('click', () => {
    const rawOtp = mobileOtpBadge.textContent?.replace(/\s+/g, '') ?? '';
    if (!/^\d{6}$/.test(rawOtp)) return;
    void copyToClipboard(rawOtp)
      .then(() => {
        copyMobileOtpBtn.textContent = copy.copied;
        setTimeout(() => { copyMobileOtpBtn.textContent = copy.copyOtp; }, 1500);
      })
      .catch(() => {
        copyMobileOtpBtn.textContent = copy.copyFailed;
        setTimeout(() => { copyMobileOtpBtn.textContent = copy.copyOtp; }, 1800);
      });
  });
  mobileOtpRow.appendChild(mobileOtpBadge);
  mobileOtpRow.appendChild(copyMobileOtpBtn);
  mobileSection.appendChild(mobileOtpRow);

  const mobileOtpHint = document.createElement('div');
  mobileOtpHint.className = 'share-mobile-otp-hint';
  mobileOtpHint.textContent = copy.waitingPairingCode;
  mobileSection.appendChild(mobileOtpHint);

  const mobileQrWrap = document.createElement('div');
  mobileQrWrap.className = 'share-mobile-qr-wrap';
  const mobileQrImg = document.createElement('img');
  mobileQrImg.className = 'share-mobile-qr';
  mobileQrImg.alt = copy.mobileControlQrAlt;
  mobileQrWrap.appendChild(mobileQrImg);
  mobileSection.appendChild(mobileQrWrap);

  const mobileStatusRow = document.createElement('div');
  mobileStatusRow.className = 'share-mobile-status-row';

  const mobileStatus = document.createElement('div');
  mobileStatus.className = 'share-mobile-status';
  mobileStatus.textContent = copy.waitingPairingCode;
  mobileStatusRow.appendChild(mobileStatus);

  const retryMobilePairingBtn = document.createElement('button');
  retryMobilePairingBtn.type = 'button';
  retryMobilePairingBtn.className = 'share-btn share-btn-secondary calder-button share-mobile-retry hidden';
  retryMobilePairingBtn.textContent = copy.retryQr;
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
  closeBtn.textContent = copy.cancel;
  closeBtn.addEventListener('click', closeShareDialog);

  const backBtn = document.createElement('button');
  backBtn.className = 'share-btn share-btn-secondary calder-button hidden';
  backBtn.textContent = copy.back;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'share-btn calder-button';
  nextBtn.textContent = copy.next;

  const startBtn = document.createElement('button');
  startBtn.className = 'share-btn calder-button hidden';
  startBtn.textContent = copy.startSharing;

  const connectBtn = document.createElement('button');
  connectBtn.className = 'share-btn calder-button hidden';
  connectBtn.textContent = copy.connect;
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
  let mobilePollingErrorCount = 0;
  let mobileFallbackLinks: string[] = [];

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

  const setPrimaryMobileLink = async (link: string): Promise<boolean> => {
    mobileLinkInput.value = link;
    const qrDataUrl = await createQrDataUrl(link);
    if (qrDataUrl) {
      mobileQrImg.src = qrDataUrl;
      mobileQrImg.classList.remove('hidden');
      return true;
    } else {
      mobileQrImg.classList.add('hidden');
      return false;
    }
  };

  const setMobileFallbackLinks = (links: string[], primaryLink: string): void => {
    const isLoopbackLink = (value: string): boolean => {
      try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
      } catch {
        return false;
      }
    };
    const deduped = Array.from(new Set(links.filter((link) => link && link.trim().length > 0)));
    mobileFallbackLinks = deduped.filter((link) => link !== primaryLink && !isLoopbackLink(link));
    const fallback = mobileFallbackLinks[0] ?? '';
    mobileFallbackInput.value = fallback;
    mobileFallbackRow.classList.toggle('hidden', !fallback);
    useMobileFallbackBtn.disabled = !fallback;
    copyMobileFallbackBtn.disabled = !fallback;
  };

  useMobileFallbackBtn.addEventListener('click', () => {
    const fallback = mobileFallbackInput.value.trim();
    if (!fallback) return;
    void setPrimaryMobileLink(fallback).then((hasQr) => {
      setMobileStatus(hasQr ? copy.usingLanFallback : `${copy.usingLanFallback} ${copy.qrUnavailableUseLink}`);
    });
  });

  const submitAnswer = async (answer: string, source: 'manual' | 'mobile') => {
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
  };

  const generateMobilePairing = async (): Promise<void> => {
    if (!mobileApi || !currentShareOffer || !currentSharePassphrase || activeOverlay !== overlay) return;
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
        selectedMode,
        appState.preferences.language ?? 'en',
        {
          type: 'offer',
          sdp: offerDescription.sdp,
        },
      );
      if (activeOverlay !== overlay) {
        void mobileApi.revokeControlPairing(pairing.pairingId).catch(() => {});
        return;
      }
      pendingMobilePairingId = pairing.pairingId;
      mobilePollingErrorCount = 0;
      const localFallbackLinks = Array.isArray(pairing.localPairingUrls) && pairing.localPairingUrls.length > 0
        ? pairing.localPairingUrls
        : [pairing.localPairingUrl];
      const primaryLink = pairing.pairingUrl || localFallbackLinks[0] || pairing.localPairingUrl;
      setMobileFallbackLinks(localFallbackLinks, primaryLink);
      const hasQr = await setPrimaryMobileLink(primaryLink);
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

  const pollMobileAnswer = async () => {
    if (!mobileApi || !pendingMobilePairingId || activeOverlay !== overlay) return;
    try {
      const result = await mobileApi.consumeControlAnswer(pendingMobilePairingId);
      if (result.status === 'ready' && result.answer) {
        pendingMobilePairingId = null;
        stopMobileAnswerPolling();
        mobilePollingErrorCount = 0;
        answerTextarea.value = result.answer;
        connectBtn.disabled = false;
        await submitAnswer(result.answer, 'mobile');
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
    if (pendingMobilePairingId && activeOverlay === overlay) {
      mobileAnswerPollTimer = setTimeout(() => {
        void pollMobileAnswer();
      }, MOBILE_ANSWER_POLL_MS);
    }
  };

  const startMobileAnswerPolling = () => {
    if (!pendingMobilePairingId) return;
    stopMobileAnswerPolling();
    mobilePollingErrorCount = 0;
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
      statusEl.textContent = localizePassphraseError(passphraseError, uiLanguage);
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = copy.generatingCode;
    statusEl.textContent = copy.generatingConnectionCode;

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
      passphraseLabel.textContent = copy.passphraseLabel;
      offerTextarea.value = offer;
      offerSection.classList.remove('hidden');
      answerSection.classList.remove('hidden');
      currentShareOffer = offer;
      currentSharePassphrase = passphrase;
      startBtn.classList.add('hidden');
      backBtn.classList.add('hidden');
      connectBtn.classList.remove('hidden');
      statusEl.textContent = copy.waitingForPeer;
      if (rtcConfig?.iceTransportPolicy === 'relay') {
        statusEl.textContent = copy.waitingForPeerTurn;
      }
      setManualFallbackVisible(!mobileApi);

      handle.onConnected(() => {
        closeShareDialog();
      });

      handle.onAuthFailed((reason: string) => {
        statusEl.textContent = copy.authenticationFailed(reason);
        connectBtn.disabled = false;
        connectBtn.textContent = copy.connect;
        answerTextarea.value = '';
        answerTextarea.readOnly = false;
        setManualFallbackVisible(true);
        setRetryVisibility(true);
        setMobileStatus(copy.authenticationFailedRestart, 'error');
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
      statusEl.textContent = copy.errorWithReason(err instanceof Error ? err.message : copy.unknownError);
      startBtn.disabled = false;
      startBtn.textContent = copy.startSharing;
    }
  });
}

export function closeShareDialog(): void {
  clearPendingMobilePairing(true);
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
