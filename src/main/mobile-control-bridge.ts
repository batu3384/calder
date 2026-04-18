import * as http from 'node:http';
import * as os from 'node:os';
import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { ShareMode, ShareRtcConfig } from '../shared/sharing-types';
import type { ShareConnectionDescription } from '../shared/types';
import { resolveShareRtcConfigFromEnv } from './share-rtc-config';

type PairingStatus = 'pending' | 'ready' | 'expired';
type MobileUiLanguage = 'en' | 'tr';

interface PairingRecord {
  id: string;
  sessionId: string;
  offer: string;
  offerDescription: ShareConnectionDescription | null;
  passphrase: string;
  mode: ShareMode;
  accessMode: 'lan' | 'remote';
  token: string;
  otpCode: string;
  attempts: number;
  otpVerified: boolean;
  submitToken: string | null;
  answer: string | null;
  answerConsumed: boolean;
  language: MobileUiLanguage;
  rtcConfig: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'>;
  createdAtMs: number;
  expiresAtMs: number;
}

interface MobileBridgeState {
  server: http.Server;
  port: number;
  host: string;
  hosts: string[];
  cleanupTimer: NodeJS.Timeout;
}

export interface MobileControlPairingOptions {
  sessionId: string;
  offer: string;
  offerDescription?: ShareConnectionDescription;
  passphrase: string;
  mode: ShareMode;
  language?: MobileUiLanguage;
  ttlMs?: number;
}

export interface MobileControlPairingResult {
  pairingId: string;
  pairingUrl: string;
  localPairingUrl: string;
  localPairingUrls: string[];
  accessMode: 'lan' | 'remote';
  otpCode: string;
  expiresAt: string;
}

export interface MobileControlAnswerResult {
  answer: string | null;
  status: PairingStatus;
}

const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_BODY_BYTES = 32 * 1024;
const CLEANUP_INTERVAL_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_BLOCK_MS = 20_000;
const SHARE_PBKDF2_ITERATIONS = 100_000;
const SHARE_SALT_LENGTH = 16;
const SHARE_IV_LENGTH = 12;
const SHARE_AES_KEY_BYTES = 32;
const SHARE_CHALLENGE_SALT = Buffer.from('calder-challenge-v1', 'utf8');

type MobilePageCopy = {
  language: MobileUiLanguage;
  title: string;
  heroKicker: string;
  heading: string;
  heroBody: string;
  otpPlaceholder: string;
  verifyConnect: string;
  otpMeta: string;
  otpHelper: string;
  waitingOtp: string;
  modePending: string;
  stateIdle: string;
  connectionFlowLabel: string;
  stageVerify: string;
  stageStream: string;
  stageControl: string;
  waitingForSessions: string;
  sessionSelectorLabel: string;
  switchButton: string;
  sessionRoutingUnavailable: string;
  mobileViewsLabel: string;
  terminalTab: string;
  controlsTab: string;
  clearButton: string;
  copyButton: string;
  followOnButton: string;
  followOffButton: string;
  commandDeck: string;
  showShortcutsButton: string;
  hideShortcutsButton: string;
  shortcutsHiddenUntilNeeded: string;
  shortcutsHiddenUntilReady: string;
  readonlyHint: string;
  repeatInputHint: string;
  commandInputPlaceholder: string;
  prevButton: string;
  nextButton: string;
  sendButton: string;
  suggestedCommandsLabel: string;
  quickControlsLabel: string;
  quickControlsTitle: string;
  browserControlDeckTitle: string;
  browserSessionSelectorLabel: string;
  browserNoSessionsAvailable: string;
  browserStatusWaiting: string;
  browserStatusReadonly: string;
  browserStatusReadyTemplate: string;
  browserBackButton: string;
  browserForwardButton: string;
  browserReloadButton: string;
  browserInspectButton: string;
  browserResponsiveButton: string;
  browserPhoneButton: string;
  browserInspectSelectionNone: string;
  browserInspectSelectionTemplate: string;
  browserInspectInputPlaceholder: string;
  browserInspectSendButton: string;
  browserInspectInstructionRequired: string;
  browserInspectNeedSelection: string;
  browserInspectSubmitting: string;
  browserInspectSucceeded: string;
  browserInspectFailedTemplate: string;
  browserControlApplying: string;
  browserControlSucceededTemplate: string;
  browserControlFailedTemplate: string;
  modePrefix: string;
  statePrefix: string;
  modeReadonly: string;
  modeReadwrite: string;
  mobileTerminalCleared: string;
  nothingToCopyYet: string;
  clipboardApiUnavailable: string;
  terminalCopied: string;
  terminalCopyFailed: string;
  switchingSession: string;
  noShareableSessions: string;
  activeSessionTemplate: string;
  chooseSessionAndSwitch: string;
  noSessionsAvailable: string;
  switchedToTemplate: string;
  switchFailedTemplate: string;
  unknownReason: string;
  connectedLiveStream: string;
  channelOpenWaitingAuth: string;
  connectionClosed: string;
  authFailedTemplate: string;
  hostEndedSession: string;
  answerDelivered: string;
  missingPairingToken: string;
  enterOtpPrompt: string;
  verifyingOtp: string;
  connectionFailed: string;
  couldNotDecodeConnectionCode: string;
  connectionCodeTooShort: string;
  wrongPassphraseOrInvalidCode: string;
  malformedConnectionPayload: string;
  missingConnectionFields: string;
  connectionTypeMismatch: string;
  serverMessage: {
    pairingExpired: string;
    tooManyPairingAttempts: string;
    requestBodyTooLarge: string;
    invalidJsonPayload: string;
    pairingTokenInvalid: string;
    tooManyOtpAttempts: string;
    otpMismatch: string;
    tooManyAnswerSubmissions: string;
    tooManyChallengeRequests: string;
    otpRequiredFirst: string;
    answerAlreadySubmitted: string;
    submitTokenInvalid: string;
    missingAnswerPayload: string;
    invalidAnswerPayload: string;
    missingChallengePayload: string;
    invalidChallengePayload: string;
    pairingNotFound: string;
    invalidPairingTokenPage: string;
    routeNotFound: string;
  };
};

const MOBILE_PAGE_COPY: Record<MobileUiLanguage, MobilePageCopy> = {
  en: {
    language: 'en',
    title: 'Calder Mobile Control',
    heroKicker: 'Secure Mobile Bridge',
    heading: 'Calder Mobile Control',
    heroBody: 'Enter the one-time code from desktop to unlock your live terminal stream and controls.',
    otpPlaceholder: '000000',
    verifyConnect: 'Verify & Connect',
    otpMeta: 'Pairing expires automatically and can be used only once.',
    otpHelper: 'Use the 6-digit OTP shown under the desktop QR. Do not enter the manual passphrase here.',
    waitingOtp: 'Waiting for OTP…',
    modePending: 'Mode: pending',
    stateIdle: 'State: idle',
    connectionFlowLabel: 'Connection flow',
    stageVerify: '1 Verify',
    stageStream: '2 Stream',
    stageControl: '3 Control',
    waitingForSessions: 'Waiting for sessions…',
    sessionSelectorLabel: 'Session selector',
    switchButton: 'Switch',
    sessionRoutingUnavailable: 'Session routing is unavailable until secure connection is ready.',
    mobileViewsLabel: 'Mobile views',
    terminalTab: 'Terminal',
    controlsTab: 'Controls',
    clearButton: 'Clear',
    copyButton: 'Copy',
    followOnButton: 'Follow On',
    followOffButton: 'Follow Off',
    commandDeck: 'Command deck',
    showShortcutsButton: 'Show shortcuts',
    hideShortcutsButton: 'Hide shortcuts',
    shortcutsHiddenUntilNeeded: 'Shortcuts stay hidden until you need them.',
    shortcutsHiddenUntilReady: 'Shortcuts stay hidden until secure connection is ready.',
    readonlyHint: 'Read-only mode is active. You can watch terminal output but cannot send commands.',
    repeatInputHint: 'Tap and hold arrows/backspace for repeat input.',
    commandInputPlaceholder: 'Type a command and press Enter',
    prevButton: 'Prev',
    nextButton: 'Next',
    sendButton: 'Send',
    suggestedCommandsLabel: 'Suggested commands',
    quickControlsLabel: 'Quick controls',
    quickControlsTitle: 'Quick controls',
    browserControlDeckTitle: 'Browser controls',
    browserSessionSelectorLabel: 'Browser session',
    browserNoSessionsAvailable: 'No browser sessions available',
    browserStatusWaiting: 'Waiting for browser session catalog…',
    browserStatusReadonly: 'Browser controls require read-write mode.',
    browserStatusReadyTemplate: 'Active browser: {name}',
    browserBackButton: 'Back',
    browserForwardButton: 'Forward',
    browserReloadButton: 'Reload',
    browserInspectButton: 'Inspect',
    browserResponsiveButton: 'Responsive',
    browserPhoneButton: 'iPhone 14',
    browserInspectSelectionNone: 'No inspect selection yet. Enable inspect and tap an element.',
    browserInspectSelectionTemplate: 'Selected element: {summary}',
    browserInspectInputPlaceholder: 'Explain what to do with the selected element',
    browserInspectSendButton: 'Send Inspect Prompt',
    browserInspectInstructionRequired: 'Write an inspect instruction before sending.',
    browserInspectNeedSelection: 'Select a browser element in inspect mode first.',
    browserInspectSubmitting: 'Sending inspect prompt…',
    browserInspectSucceeded: 'Inspect prompt delivered to active CLI session.',
    browserInspectFailedTemplate: 'Inspect prompt failed: {reason}',
    browserControlApplying: 'Applying browser action…',
    browserControlSucceededTemplate: 'Browser action applied: {action}',
    browserControlFailedTemplate: 'Browser action failed: {reason}',
    modePrefix: 'Mode',
    statePrefix: 'State',
    modeReadonly: 'read-only',
    modeReadwrite: 'read-write',
    mobileTerminalCleared: 'Mobile terminal view cleared.',
    nothingToCopyYet: 'Nothing to copy yet.',
    clipboardApiUnavailable: 'Clipboard API is unavailable on this browser.',
    terminalCopied: 'Terminal output copied to clipboard.',
    terminalCopyFailed: 'Could not copy terminal output.',
    switchingSession: 'Switching active session…',
    noShareableSessions: 'No shareable terminal sessions are currently available.',
    activeSessionTemplate: 'Active session: {name}',
    chooseSessionAndSwitch: 'Choose a session and tap Switch.',
    noSessionsAvailable: 'No sessions available',
    switchedToTemplate: 'Switched to {name}.',
    switchFailedTemplate: 'Could not switch session: {reason}',
    unknownReason: 'Unknown reason.',
    connectedLiveStream: 'Connected. Live stream active.',
    channelOpenWaitingAuth: 'Channel open, waiting for host authentication challenge…',
    connectionClosed: 'Connection closed.',
    authFailedTemplate: 'Authentication failed: {reason}',
    hostEndedSession: 'Host ended the shared session.',
    answerDelivered: 'Answer delivered. Waiting for host confirmation…',
    missingPairingToken: 'Missing pairing token.',
    enterOtpPrompt: 'Enter the 6-digit one-time code from desktop.',
    verifyingOtp: 'Verifying one-time code…',
    connectionFailed: 'Connection failed.',
    couldNotDecodeConnectionCode: 'Could not decode connection code.',
    connectionCodeTooShort: 'Connection code is too short.',
    wrongPassphraseOrInvalidCode: 'Secure handshake could not be verified. QR pairing may be stale or expired. Generate a new QR on desktop and try again.',
    malformedConnectionPayload: 'Connection code payload is malformed.',
    missingConnectionFields: 'Connection code is missing fields.',
    connectionTypeMismatch: 'Connection code type mismatch.',
    serverMessage: {
      pairingExpired: 'Pairing expired.',
      tooManyPairingAttempts: 'Too many pairing attempts. Please wait and try again.',
      requestBodyTooLarge: 'Request body too large.',
      invalidJsonPayload: 'Invalid JSON payload.',
      pairingTokenInvalid: 'Pairing token is invalid.',
      tooManyOtpAttempts: 'Too many OTP attempts.',
      otpMismatch: 'One-time code mismatch.',
      tooManyAnswerSubmissions: 'Too many answer submissions. Please wait and retry.',
      tooManyChallengeRequests: 'Too many auth requests. Please wait and retry.',
      otpRequiredFirst: 'OTP verification is required first.',
      answerAlreadySubmitted: 'Answer has already been submitted for this pairing.',
      submitTokenInvalid: 'Submit token is invalid.',
      missingAnswerPayload: 'Missing answer payload.',
      invalidAnswerPayload: 'Answer payload is invalid.',
      missingChallengePayload: 'Missing auth challenge payload.',
      invalidChallengePayload: 'Auth challenge payload is invalid.',
      pairingNotFound: 'Pairing not found.',
      invalidPairingTokenPage: 'Invalid pairing token.',
      routeNotFound: 'Route not found.',
    },
  },
  tr: {
    language: 'tr',
    title: 'Calder Mobil Kontrol',
    heroKicker: 'Güvenli Mobil Köprü',
    heading: 'Calder Mobil Kontrol',
    heroBody: 'Canlı terminal akışını ve kontrolleri açmak için masaüstündeki tek kullanımlık kodu girin.',
    otpPlaceholder: '000000',
    verifyConnect: 'Doğrula ve Bağlan',
    otpMeta: 'Eşleştirme otomatik olarak sona erer ve yalnızca bir kez kullanılabilir.',
    otpHelper: 'Masaüstünde QR altında görünen 6 haneli OTP\'yi girin. Buraya manuel parola girmeyin.',
    waitingOtp: 'OTP bekleniyor…',
    modePending: 'Mod: bekleniyor',
    stateIdle: 'Durum: boşta',
    connectionFlowLabel: 'Bağlantı akışı',
    stageVerify: '1 Doğrula',
    stageStream: '2 Akış',
    stageControl: '3 Kontrol',
    waitingForSessions: 'Oturumlar bekleniyor…',
    sessionSelectorLabel: 'Oturum seçici',
    switchButton: 'Geç',
    sessionRoutingUnavailable: 'Güvenli bağlantı hazır olana kadar oturum yönlendirme kullanılamaz.',
    mobileViewsLabel: 'Mobil görünümler',
    terminalTab: 'Terminal',
    controlsTab: 'Kontroller',
    clearButton: 'Temizle',
    copyButton: 'Kopyala',
    followOnButton: 'Takip Açık',
    followOffButton: 'Takip Kapalı',
    commandDeck: 'Komut paneli',
    showShortcutsButton: 'Kısayolları göster',
    hideShortcutsButton: 'Kısayolları gizle',
    shortcutsHiddenUntilNeeded: 'İhtiyacınız olana kadar kısayollar gizli kalır.',
    shortcutsHiddenUntilReady: 'Güvenli bağlantı hazır olana kadar kısayollar gizli kalır.',
    readonlyHint: 'Salt okunur mod etkin. Terminal çıktısını izleyebilirsiniz ancak komut gönderemezsiniz.',
    repeatInputHint: 'Tekrarlı giriş için ok/backspace tuşlarına basılı tutun.',
    commandInputPlaceholder: 'Komut yazın ve Enter\'a basın',
    prevButton: 'Önceki',
    nextButton: 'Sonraki',
    sendButton: 'Gönder',
    suggestedCommandsLabel: 'Önerilen komutlar',
    quickControlsLabel: 'Hızlı kontroller',
    quickControlsTitle: 'Hızlı kontroller',
    browserControlDeckTitle: 'Tarayıcı kontrolleri',
    browserSessionSelectorLabel: 'Tarayıcı oturumu',
    browserNoSessionsAvailable: 'Tarayıcı oturumu yok',
    browserStatusWaiting: 'Tarayıcı oturum kataloğu bekleniyor…',
    browserStatusReadonly: 'Tarayıcı kontrolleri için okuma-yazma modu gerekir.',
    browserStatusReadyTemplate: 'Aktif tarayıcı: {name}',
    browserBackButton: 'Geri',
    browserForwardButton: 'İleri',
    browserReloadButton: 'Yenile',
    browserInspectButton: 'Inspect',
    browserResponsiveButton: 'Responsive',
    browserPhoneButton: 'iPhone 14',
    browserInspectSelectionNone: 'Henüz inspect seçimi yok. Inspect modunu açıp bir elemana dokunun.',
    browserInspectSelectionTemplate: 'Seçili element: {summary}',
    browserInspectInputPlaceholder: 'Seçili element ile ne yapılacağını yazın',
    browserInspectSendButton: 'Inspect Prompt Gönder',
    browserInspectInstructionRequired: 'Göndermeden önce bir inspect talimatı yazın.',
    browserInspectNeedSelection: 'Önce inspect modunda bir tarayıcı elementi seçin.',
    browserInspectSubmitting: 'Inspect prompt gönderiliyor…',
    browserInspectSucceeded: 'Inspect prompt aktif CLI oturumuna iletildi.',
    browserInspectFailedTemplate: 'Inspect prompt başarısız: {reason}',
    browserControlApplying: 'Tarayıcı aksiyonu uygulanıyor…',
    browserControlSucceededTemplate: 'Tarayıcı aksiyonu uygulandı: {action}',
    browserControlFailedTemplate: 'Tarayıcı aksiyonu başarısız: {reason}',
    modePrefix: 'Mod',
    statePrefix: 'Durum',
    modeReadonly: 'salt okunur',
    modeReadwrite: 'okuma-yazma',
    mobileTerminalCleared: 'Mobil terminal görünümü temizlendi.',
    nothingToCopyYet: 'Henüz kopyalanacak içerik yok.',
    clipboardApiUnavailable: 'Bu tarayıcıda panoya kopyalama API\'si kullanılamıyor.',
    terminalCopied: 'Terminal çıktısı panoya kopyalandı.',
    terminalCopyFailed: 'Terminal çıktısı kopyalanamadı.',
    switchingSession: 'Aktif oturuma geçiliyor…',
    noShareableSessions: 'Şu anda paylaşılabilir terminal oturumu yok.',
    activeSessionTemplate: 'Aktif oturum: {name}',
    chooseSessionAndSwitch: 'Bir oturum seçin ve Geç\'e dokunun.',
    noSessionsAvailable: 'Oturum yok',
    switchedToTemplate: '{name} oturumuna geçildi.',
    switchFailedTemplate: 'Oturum değiştirilemedi: {reason}',
    unknownReason: 'Bilinmeyen neden.',
    connectedLiveStream: 'Bağlandı. Canlı akış aktif.',
    channelOpenWaitingAuth: 'Kanal açıldı, ana makine kimlik doğrulama isteği bekleniyor…',
    connectionClosed: 'Bağlantı kapandı.',
    authFailedTemplate: 'Kimlik doğrulama başarısız: {reason}',
    hostEndedSession: 'Ana makine paylaşılan oturumu sonlandırdı.',
    answerDelivered: 'Yanıt gönderildi. Ana makine onayı bekleniyor…',
    missingPairingToken: 'Eşleştirme belirteci eksik.',
    enterOtpPrompt: 'Masaüstündeki 6 haneli tek kullanımlık kodu girin.',
    verifyingOtp: 'Tek kullanımlık kod doğrulanıyor…',
    connectionFailed: 'Bağlantı başarısız.',
    couldNotDecodeConnectionCode: 'Bağlantı kodu çözümlenemedi.',
    connectionCodeTooShort: 'Bağlantı kodu çok kısa.',
    wrongPassphraseOrInvalidCode: 'Güvenli el sıkışma doğrulanamadı. QR eşleştirmesi eski veya süresi dolmuş olabilir. Masaüstünde yeni QR üretip tekrar deneyin.',
    malformedConnectionPayload: 'Bağlantı kodu verisi bozuk.',
    missingConnectionFields: 'Bağlantı kodunda gerekli alanlar eksik.',
    connectionTypeMismatch: 'Bağlantı kodu türü eşleşmiyor.',
    serverMessage: {
      pairingExpired: 'Eşleştirme süresi doldu.',
      tooManyPairingAttempts: 'Çok fazla eşleştirme denemesi yapıldı. Lütfen bekleyip tekrar deneyin.',
      requestBodyTooLarge: 'İstek gövdesi çok büyük.',
      invalidJsonPayload: 'Geçersiz JSON verisi.',
      pairingTokenInvalid: 'Eşleştirme belirteci geçersiz.',
      tooManyOtpAttempts: 'Çok fazla OTP denemesi yapıldı.',
      otpMismatch: 'Tek kullanımlık kod eşleşmedi.',
      tooManyAnswerSubmissions: 'Çok fazla yanıt gönderimi yapıldı. Lütfen bekleyip tekrar deneyin.',
      tooManyChallengeRequests: 'Çok fazla kimlik doğrulama isteği yapıldı. Lütfen bekleyip tekrar deneyin.',
      otpRequiredFirst: 'Önce OTP doğrulaması gerekli.',
      answerAlreadySubmitted: 'Bu eşleştirme için yanıt zaten gönderildi.',
      submitTokenInvalid: 'Gönderim belirteci geçersiz.',
      missingAnswerPayload: 'Yanıt verisi eksik.',
      invalidAnswerPayload: 'Yanıt verisi geçersiz.',
      missingChallengePayload: 'Kimlik doğrulama isteği verisi eksik.',
      invalidChallengePayload: 'Kimlik doğrulama isteği verisi geçersiz.',
      pairingNotFound: 'Eşleştirme bulunamadı.',
      invalidPairingTokenPage: 'Geçersiz eşleştirme belirteci.',
      routeNotFound: 'Rota bulunamadı.',
    },
  },
};

function normalizeMobileLanguage(input: unknown): MobileUiLanguage {
  return input === 'tr' ? 'tr' : 'en';
}

function getMobileCopy(language: MobileUiLanguage): MobilePageCopy {
  return MOBILE_PAGE_COPY[normalizeMobileLanguage(language)];
}

function getRequestLanguage(url: URL, req: http.IncomingMessage): MobileUiLanguage {
  if (url.searchParams.get('lang') === 'tr') {
    return 'tr';
  }
  const acceptLanguage = req.headers['accept-language'];
  if (typeof acceptLanguage === 'string' && /\btr\b/i.test(acceptLanguage)) {
    return 'tr';
  }
  if (Array.isArray(acceptLanguage) && acceptLanguage.some((value) => /\btr\b/i.test(value))) {
    return 'tr';
  }
  return 'en';
}

let bridgeState: MobileBridgeState | null = null;
const pairings = new Map<string, PairingRecord>();
const requestRateLimits = new Map<string, { windowStartMs: number; count: number; blockedUntilMs: number }>();

function clearRateLimitEntriesForPairing(pairingId: string): void {
  const token = `:${pairingId}:`;
  for (const key of requestRateLimits.keys()) {
    if (key.includes(token)) {
      requestRateLimits.delete(key);
    }
  }
}

function isExpired(record: PairingRecord): boolean {
  return Date.now() > record.expiresAtMs;
}

function cleanupExpiredPairings(): void {
  for (const [pairingId, record] of pairings) {
    if (isExpired(record)) {
      pairings.delete(pairingId);
      clearRateLimitEntriesForPairing(pairingId);
    }
  }

  const now = Date.now();
  for (const [key, value] of requestRateLimits) {
    if (value.blockedUntilMs < now && now - value.windowStartMs > RATE_LIMIT_WINDOW_MS * 2) {
      requestRateLimits.delete(key);
    }
  }
}

function isPrivateIpv4(address: string): boolean {
  return (
    /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function parseIpv4ToInt(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return (
    (((octets[0] << 24) >>> 0)
    | ((octets[1] << 16) >>> 0)
    | ((octets[2] << 8) >>> 0)
    | (octets[3] >>> 0))
  ) >>> 0;
}

function isInvalidIpv4HostAddress(address: string, netmask: string | undefined): boolean {
  if (!netmask) return false;
  const addressInt = parseIpv4ToInt(address);
  const netmaskInt = parseIpv4ToInt(netmask);
  if (addressInt === null || netmaskInt === null) return false;

  const hostMask = (~netmaskInt) >>> 0;
  if (hostMask === 0 || hostMask === 1) return false;
  const hostBits = addressInt & hostMask;
  return hostBits === 0 || hostBits === hostMask;
}

function isUsableLanIpv4Candidate(entry: os.NetworkInterfaceInfoIPv4): boolean {
  if (entry.internal) return false;
  if (!isPrivateIpv4(entry.address)) return false;
  if (/^169\.254\./.test(entry.address)) return false;
  if (entry.netmask === '255.255.255.255') return false;
  if (isInvalidIpv4HostAddress(entry.address, entry.netmask)) return false;
  return true;
}

function listLanHosts(nets: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const preferred: string[] = [];
  const secondary: string[] = [];
  const fallback: string[] = [];
  const seen = new Set<string>();

  const isProbablyLanInterface = (name: string): boolean => (
    /^(en|eth|wlan|wifi|wl|lan)/i.test(name)
    || /wi-?fi/i.test(name)
  );
  const isUsuallyVirtualInterface = (name: string): boolean => (
    /^(lo|loopback|docker|veth|br-|bridge|vmnet|utun|tailscale|wg|awdl)/i.test(name)
  );

  for (const [interfaceName, values] of Object.entries(nets)) {
    if (!values) continue;
    for (const entry of values) {
      if (entry.family !== 'IPv4') continue;
      const ipv4Entry = entry as os.NetworkInterfaceInfoIPv4;
      if (!isUsableLanIpv4Candidate(ipv4Entry)) continue;
      const address = entry.address;
      if (!address || seen.has(address)) continue;
      seen.add(address);

      if (isProbablyLanInterface(interfaceName)) {
        preferred.push(address);
      } else if (isUsuallyVirtualInterface(interfaceName)) {
        fallback.push(address);
      } else {
        secondary.push(address);
      }
    }
  }

  const ordered = [...preferred, ...secondary, ...fallback];
  if (ordered.length === 0) {
    ordered.push('127.0.0.1');
  } else if (!ordered.includes('127.0.0.1')) {
    ordered.push('127.0.0.1');
  }
  return ordered;
}

function pickLanHost(): string {
  return listLanHosts()[0] ?? '127.0.0.1';
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(message);
}

function readBody(req: http.IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('request_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function getPairingFromPath(pathname: string, suffix: '/bootstrap' | '/answer' | '/challenge'): PairingRecord | null {
  const match = pathname.match(new RegExp(`^/api/pair/([a-f0-9]{24})${suffix}$`));
  if (!match) return null;
  return pairings.get(match[1]) ?? null;
}

function getPagePairing(pathname: string): PairingRecord | null {
  const match = pathname.match(/^\/m\/([a-f0-9]{24})$/);
  if (!match) return null;
  return pairings.get(match[1]) ?? null;
}

function verifyPairingToken(record: PairingRecord, token: unknown): boolean {
  return safeCompareToken(record.token, token);
}

function safeCompareToken(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function getRequestClientAddress(req: http.IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

function isRateLimited(
  req: http.IncomingMessage,
  pairingId: string,
  scope: 'bootstrap' | 'answer' | 'challenge',
): boolean {
  const now = Date.now();
  const key = `${scope}:${pairingId}:${getRequestClientAddress(req)}`;
  const existing = requestRateLimits.get(key);
  if (!existing) {
    requestRateLimits.set(key, { windowStartMs: now, count: 1, blockedUntilMs: 0 });
    return false;
  }

  if (existing.blockedUntilMs > now) {
    return true;
  }

  if (now - existing.windowStartMs > RATE_LIMIT_WINDOW_MS) {
    existing.windowStartMs = now;
    existing.count = 1;
    return false;
  }

  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    existing.blockedUntilMs = now + RATE_LIMIT_BLOCK_MS;
    return true;
  }
  return false;
}

function createOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeShareConnectionDescription(value: unknown, expectedType: 'offer' | 'answer'): ShareConnectionDescription | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { type?: unknown; sdp?: unknown };
  if (candidate.type !== expectedType) return null;
  if (typeof candidate.sdp !== 'string' || candidate.sdp.trim().length === 0) return null;
  return {
    type: expectedType,
    sdp: candidate.sdp,
  };
}

function normalizeSharePassphrase(passphrase: string): string {
  return passphrase.trim().replace(/[\s-]+/g, '').toUpperCase();
}

function deriveShareKey(passphrase: string, salt: Uint8Array): Buffer {
  return pbkdf2Sync(
    Buffer.from(normalizeSharePassphrase(passphrase), 'utf8'),
    salt,
    SHARE_PBKDF2_ITERATIONS,
    SHARE_AES_KEY_BYTES,
    'sha256',
  );
}

function encodeShareConnectionDescription(description: ShareConnectionDescription, passphrase: string): string {
  const salt = randomBytes(SHARE_SALT_LENGTH);
  const iv = randomBytes(SHARE_IV_LENGTH);
  const key = deriveShareKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(description), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const packed = Buffer.concat([salt, iv, ciphertext]);
  return packed.toString('base64');
}

function decodeShareConnectionCode(
  encoded: string,
  passphrase: string,
  expectedType: 'offer' | 'answer',
): ShareConnectionDescription {
  let packed: Buffer;
  try {
    packed = Buffer.from(encoded, 'base64');
  } catch {
    throw new Error('invalid_base64');
  }
  if (packed.length <= SHARE_SALT_LENGTH + SHARE_IV_LENGTH + 16) {
    throw new Error('payload_too_short');
  }
  const salt = packed.subarray(0, SHARE_SALT_LENGTH);
  const iv = packed.subarray(SHARE_SALT_LENGTH, SHARE_SALT_LENGTH + SHARE_IV_LENGTH);
  const encrypted = packed.subarray(SHARE_SALT_LENGTH + SHARE_IV_LENGTH);
  if (encrypted.length <= 16) {
    throw new Error('ciphertext_too_short');
  }
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const authTag = encrypted.subarray(encrypted.length - 16);
  const key = deriveShareKey(passphrase, salt);

  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('decrypt_failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('json_failed');
  }

  const description = normalizeShareConnectionDescription(parsed, expectedType);
  if (!description) {
    throw new Error('invalid_description');
  }
  return description;
}

function isHexString(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function computeShareChallengeResponse(challengeHex: string, passphrase: string): string {
  const challenge = Buffer.from(challengeHex, 'hex');
  const hmacKey = pbkdf2Sync(
    Buffer.from(normalizeSharePassphrase(passphrase), 'utf8'),
    SHARE_CHALLENGE_SALT,
    SHARE_PBKDF2_ITERATIONS,
    SHARE_AES_KEY_BYTES,
    'sha256',
  );
  return createHmac('sha256', hmacKey).update(challenge).digest('hex');
}

function resolveMobilePublicBaseUrl(env: NodeJS.ProcessEnv = process.env): URL | null {
  const raw = env.CALDER_MOBILE_PUBLIC_BASE_URL;
  if (!isNonEmptyString(raw)) return null;

  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because protocol is not http/https.');
      return null;
    }
    if (parsed.username || parsed.password) {
      console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because credentials are not allowed.');
      return null;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed;
  } catch {
    console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because value is not a valid URL.');
    return null;
  }
}

function buildPairingUrl(
  baseUrl: URL,
  pairingId: string,
  token: string,
  tokenTransport: 'query' | 'fragment' = 'query',
  includeQueryFallbackToken: boolean = false,
  language: MobileUiLanguage = 'en',
): string {
  const normalizedBaseUrl = new URL(baseUrl.toString());
  if (!normalizedBaseUrl.pathname.endsWith('/')) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }
  const pairingPageUrl = new URL(`m/${pairingId}`, normalizedBaseUrl);
  if (language === 'tr') {
    pairingPageUrl.searchParams.set('lang', 'tr');
  }
  if (tokenTransport === 'query') {
    pairingPageUrl.searchParams.set('t', token);
  } else {
    if (includeQueryFallbackToken) {
      pairingPageUrl.searchParams.set('t', token);
    }
    const hashParams = new URLSearchParams();
    hashParams.set('t', token);
    pairingPageUrl.hash = hashParams.toString();
  }
  return pairingPageUrl.toString();
}

function renderMobilePage(pairingId: string, language: MobileUiLanguage): string {
  const copy = MOBILE_PAGE_COPY[language];
  return `<!doctype html>
<html lang="${copy.language}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${copy.title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #060a14;
      --bg-alt: #0a1326;
      --panel: rgba(11, 20, 38, 0.78);
      --panel-strong: rgba(14, 25, 46, 0.9);
      --border: rgba(120, 163, 255, 0.28);
      --border-strong: rgba(146, 182, 255, 0.48);
      --text: #e9f1ff;
      --muted: #9fb0d6;
      --accent: #4d8dff;
      --accent-strong: #2f73ff;
      --accent-soft: rgba(77, 141, 255, 0.2);
      --danger: #ff7d88;
      --ok: #54cf9c;
      --shadow: 0 24px 48px rgba(1, 5, 14, 0.5);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at 14% 18%, rgba(42, 109, 255, 0.44) 0%, rgba(42, 109, 255, 0) 42%),
        radial-gradient(circle at 86% 4%, rgba(74, 203, 255, 0.24) 0%, rgba(74, 203, 255, 0) 34%),
        linear-gradient(165deg, var(--bg-alt) 0%, var(--bg) 52%, #050913 100%);
      color: var(--text);
      min-height: 100vh;
      padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      position: relative;
      overflow-x: hidden;
      overscroll-behavior-y: contain;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      width: 52vmax;
      height: 52vmax;
      border-radius: 999px;
      filter: blur(34px);
      opacity: 0.2;
      pointer-events: none;
      z-index: 0;
      animation: aurora-drift 22s ease-in-out infinite alternate;
    }
    body::before {
      top: -22vmax;
      right: -18vmax;
      background: radial-gradient(circle at 32% 40%, rgba(86, 165, 255, 0.95) 0%, rgba(86, 165, 255, 0) 65%);
    }
    body::after {
      bottom: -24vmax;
      left: -16vmax;
      background: radial-gradient(circle at 56% 52%, rgba(70, 236, 187, 0.68) 0%, rgba(70, 236, 187, 0) 70%);
      animation-delay: 1.2s;
    }
    @keyframes aurora-drift {
      0% { transform: translate3d(0, 0, 0) scale(1); }
      100% { transform: translate3d(3vmax, -2vmax, 0) scale(1.06); }
    }
    .shell {
      position: relative;
      z-index: 1;
      max-width: 680px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
    .panel {
      background:
        linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 35%, rgba(255,255,255,0) 100%),
        var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 15px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .hero-panel {
      background:
        radial-gradient(circle at 8% 10%, rgba(91, 157, 255, 0.22) 0%, rgba(91, 157, 255, 0) 44%),
        linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 40%, rgba(255,255,255,0) 100%),
        var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 21px;
      line-height: 1.15;
      letter-spacing: -0.015em;
      font-weight: 700;
    }
    p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .hero-kicker {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #bfd0ff;
    }
    .hero-kicker::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(180deg, #78adff, #4b8aff);
      box-shadow: 0 0 0 4px rgba(92, 142, 255, 0.15);
    }
    .otp-row {
      margin-top: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .otp-meta {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
      opacity: 0.9;
    }
    .otp-helper {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.45;
      color: #b6c6e8;
    }
    .otp {
      width: 100%;
      min-width: 0;
      padding: 11px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(7, 15, 30, 0.95), rgba(6, 13, 28, 0.9));
      color: var(--text);
      letter-spacing: 0.24em;
      font-size: 20px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .btn {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 10px 14px;
      background: linear-gradient(180deg, #5a99ff, var(--accent-strong));
      color: #f7fbff;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, background 160ms ease;
      box-shadow: 0 10px 20px rgba(40, 91, 203, 0.34);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover:not([disabled]) {
      filter: brightness(1.06);
      box-shadow: 0 12px 24px rgba(40, 91, 203, 0.36);
      transform: translateY(-1px);
    }
    .btn:active { transform: translateY(1px); }
    .btn[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
    }
    .btn.secondary {
      background: linear-gradient(180deg, rgba(22, 34, 60, 0.94), rgba(12, 24, 44, 0.88));
      border-color: var(--border);
      color: var(--text);
      box-shadow: none;
    }
    .btn.ghost {
      background: rgba(10, 20, 36, 0.72);
      border-color: rgba(131, 168, 246, 0.34);
      box-shadow: none;
      color: #d9e6ff;
    }
    .btn.slim {
      padding: 8px 10px;
      font-size: 12px;
      border-radius: 10px;
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
      min-height: 18px;
      border-left: 2px solid transparent;
      padding-left: 8px;
    }
    .status.error { color: var(--danger); }
    .status.ok { color: var(--ok); }
    .status.error { border-left-color: rgba(255, 125, 136, 0.6); }
    .status.ok { border-left-color: rgba(84, 207, 156, 0.64); }
    .status-grid {
      display: grid;
      gap: 8px;
    }
    .stage-rail {
      margin-top: 11px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }
    .stage-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid rgba(125, 160, 240, 0.28);
      background: rgba(10, 19, 36, 0.72);
      color: #adc0e8;
      min-height: 34px;
      padding: 7px 10px;
      font-size: 11px;
      letter-spacing: 0.045em;
      text-transform: uppercase;
      transition: border-color 160ms ease, color 160ms ease, background 160ms ease, box-shadow 160ms ease;
      text-align: center;
    }
    .stage-chip.active {
      border-color: rgba(127, 169, 255, 0.76);
      color: #e7f0ff;
      box-shadow: 0 0 0 1px rgba(127, 169, 255, 0.28) inset;
    }
    .stage-chip.done {
      border-color: rgba(84, 207, 156, 0.74);
      color: #dff8ec;
      background: rgba(11, 36, 31, 0.8);
    }
    .session-switch-row {
      margin-top: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .session-select {
      width: 100%;
      min-width: 0;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #060d1c;
      color: var(--text);
      padding: 10px 12px;
      font-size: 13px;
    }
    .session-switch-note {
      margin-top: 7px;
      font-size: 11px;
      color: var(--muted);
      min-height: 16px;
    }
    .mobile-view-tabs {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .mobile-view-tab {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 9px 10px;
      background: linear-gradient(180deg, rgba(10, 18, 35, 0.94), rgba(8, 17, 33, 0.9));
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
    }
    .mobile-view-tab.active {
      color: var(--text);
      background: linear-gradient(180deg, rgba(18, 33, 59, 0.95), rgba(13, 26, 49, 0.92));
      border-color: var(--border-strong);
    }
    .mobile-view-tab:disabled {
      opacity: 0.45;
    }
    .mobile-view-pane {
      display: none;
      margin-top: 12px;
    }
    .mobile-view-pane.active {
      display: block;
    }
    .terminal-toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .terminal-toolbar .btn.slim.active {
      border-color: var(--border-strong);
      color: #ffffff;
      background: linear-gradient(180deg, rgba(22, 46, 85, 0.95), rgba(15, 32, 59, 0.9));
    }
    .terminal {
      width: 100%;
      min-height: 320px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(7, 12, 24, 0.9), rgba(4, 8, 16, 0.93)),
        repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 26px);
      padding: 12px 12px 14px;
      margin-top: 0;
      font-family: "SFMono-Regular", "Menlo", "Monaco", "Cascadia Mono", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow-y: auto;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .composer {
      display: none;
      margin-top: 10px;
      gap: 8px;
      align-items: center;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "prev input next send";
    }
    .composer.visible { display: grid; }
    .composer input {
      grid-area: input;
      min-width: 0;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(7, 15, 30, 0.95), rgba(6, 13, 28, 0.9));
      color: var(--text);
      padding: 10px 12px;
      font-size: 13px;
    }
    .composer .btn[data-mobile-history-prev] { grid-area: prev; }
    .composer .btn[data-mobile-history-next] { grid-area: next; }
    .composer #send { grid-area: send; }
    .control-head {
      display: grid;
      gap: 7px;
      margin-top: 6px;
      margin-bottom: 8px;
    }
    .control-title {
      font-size: 11px;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .shortcut-toggle-row {
      display: none;
    }
    .shortcut-toggle-row.visible {
      display: block;
    }
    .shortcut-toggle-row .btn {
      width: 100%;
      justify-content: center;
    }
    .shortcut-toggle-row .btn.active {
      border-color: var(--border-strong);
      background: linear-gradient(180deg, rgba(21, 44, 80, 0.96), rgba(15, 31, 58, 0.92));
      color: #f3f8ff;
    }
    .shortcut-hint {
      font-size: 11px;
      line-height: 1.4;
      color: var(--muted);
      margin-top: -2px;
    }
    .command-chip-list {
      display: none;
      margin-top: 8px;
      gap: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .command-chip-list.visible {
      display: grid;
    }
    .command-chip {
      text-align: left;
      justify-content: flex-start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .quick-controls {
      display: none;
      margin-top: 10px;
      gap: 10px;
    }
    .quick-controls.visible {
      display: grid;
    }
    .quick-controls-title {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .quick-controls-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .quick-controls-grid .btn {
      width: 100%;
      min-height: 38px;
      padding: 9px 8px;
      font-size: 12px;
    }
    .quick-controls-grid .btn[data-control="up"],
    .quick-controls-grid .btn[data-control="left"],
    .quick-controls-grid .btn[data-control="down"],
    .quick-controls-grid .btn[data-control="right"] {
      font-size: 14px;
      font-weight: 700;
    }
    .browser-controls {
      display: none;
      margin-top: 12px;
      gap: 8px;
    }
    .browser-controls.visible {
      display: grid;
    }
    .browser-session-row {
      margin-top: 0;
    }
    .browser-controls-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .browser-controls-grid .btn {
      min-height: 36px;
      font-size: 12px;
    }
    .browser-control-status {
      margin-top: 0;
    }
    .browser-inspect-selection {
      margin: 2px 0 0;
      font-size: 12px;
      line-height: 1.4;
      color: var(--muted);
      min-height: 18px;
    }
    .browser-inspect-composer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      margin-top: 2px;
    }
    .browser-inspect-composer input {
      min-height: 36px;
    }
    .browser-inspect-composer .btn {
      min-height: 36px;
      white-space: nowrap;
      padding-inline: 12px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 9px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: rgba(9, 18, 34, 0.78);
    }
    input:focus-visible,
    select:focus-visible,
    button:focus-visible {
      outline: 2px solid rgba(142, 183, 255, 0.95);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transition: none !important;
      }
    }
    @media (max-width: 520px) {
      .panel {
        padding: 13px;
        border-radius: 16px;
      }
      .otp-row {
        grid-template-columns: 1fr;
      }
      .session-switch-row {
        grid-template-columns: 1fr;
      }
      .mobile-view-tabs {
        grid-template-columns: 1fr 1fr;
      }
      .command-chip-list {
        grid-template-columns: 1fr;
      }
      .browser-inspect-composer {
        grid-template-columns: 1fr;
      }
      .stage-rail {
        grid-template-columns: 1fr;
      }
      .composer.visible {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          "prev input next"
          "send send send";
      }
      .composer #send {
        width: 100%;
      }
      .terminal {
        min-height: 268px;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel hero-panel">
      <div class="hero-kicker">${copy.heroKicker}</div>
      <h1>${copy.heading}</h1>
      <p>${copy.heroBody}</p>
      <div class="otp-row">
        <input id="otp" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${copy.otpPlaceholder}" />
        <button id="connect" class="btn" disabled>${copy.verifyConnect}</button>
      </div>
      <div class="otp-meta">${copy.otpMeta}</div>
      <div class="otp-helper">${copy.otpHelper}</div>
      <div id="status" class="status">${copy.waitingOtp}</div>
    </section>

    <section class="panel">
      <div class="status-grid">
        <div class="row">
          <span id="modeBadge" class="badge">${copy.modePending}</span>
          <span id="connBadge" class="badge">${copy.stateIdle}</span>
        </div>
        <div class="stage-rail" aria-label="${copy.connectionFlowLabel}">
          <span class="stage-chip active" data-mobile-stage-chip data-stage="verify">${copy.stageVerify}</span>
          <span class="stage-chip" data-mobile-stage-chip data-stage="stream">${copy.stageStream}</span>
          <span class="stage-chip" data-mobile-stage-chip data-stage="controls">${copy.stageControl}</span>
        </div>
        <div class="session-switch-row">
          <select id="sessionSelect" class="session-select" data-mobile-session-select aria-label="${copy.sessionSelectorLabel}" disabled>
            <option value="">${copy.waitingForSessions}</option>
          </select>
          <button id="sessionSwitchButton" type="button" class="btn secondary" data-mobile-session-switch disabled>${copy.switchButton}</button>
        </div>
        <div id="sessionSwitchNote" class="session-switch-note">${copy.sessionRoutingUnavailable}</div>
      </div>
      <div class="mobile-view-tabs" role="tablist" aria-label="${copy.mobileViewsLabel}">
        <button type="button" class="mobile-view-tab active" data-mobile-view-tab="terminal" aria-selected="true">${copy.terminalTab}</button>
        <button type="button" class="mobile-view-tab" data-mobile-view-tab="controls" aria-selected="false" disabled>${copy.controlsTab}</button>
      </div>
      <div id="terminalView" class="mobile-view-pane active" data-mobile-view="terminal">
        <div class="terminal-toolbar">
          <button id="terminalClearButton" type="button" class="btn ghost slim" data-mobile-terminal-clear>${copy.clearButton}</button>
          <button id="terminalCopyButton" type="button" class="btn ghost slim" data-mobile-terminal-copy>${copy.copyButton}</button>
          <button id="terminalFollowButton" type="button" class="btn ghost slim active" data-mobile-terminal-follow>${copy.followOnButton}</button>
        </div>
        <pre id="terminal" class="terminal" aria-live="polite"></pre>
      </div>
      <div id="controlsView" class="mobile-view-pane" data-mobile-view="controls">
        <div class="control-head">
          <div class="control-title">${copy.commandDeck}</div>
          <div id="shortcutToggleRow" class="shortcut-toggle-row">
            <button id="shortcutToggleButton" type="button" class="btn ghost slim" data-mobile-shortcut-toggle disabled aria-expanded="false">${copy.showShortcutsButton}</button>
          </div>
          <div id="shortcutHint" class="shortcut-hint">${copy.shortcutsHiddenUntilNeeded}</div>
        </div>
        <form id="composer" class="composer" autocomplete="off">
          <button id="historyPrevButton" class="btn secondary slim" type="button" data-mobile-history-prev>${copy.prevButton}</button>
          <input id="commandInput" placeholder="${copy.commandInputPlaceholder}" />
          <button id="historyNextButton" class="btn secondary slim" type="button" data-mobile-history-next>${copy.nextButton}</button>
          <button id="send" class="btn secondary" type="submit">${copy.sendButton}</button>
        </form>
        <div id="commandChipList" class="command-chip-list" aria-label="${copy.suggestedCommandsLabel}">
          <button type="button" class="btn ghost slim command-chip" data-command-chip="pwd" data-mobile-command-chip>pwd</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="ls -la" data-mobile-command-chip>ls -la</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="git status" data-mobile-command-chip>git status</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="npm test" data-mobile-command-chip>npm test</button>
        </div>
        <div id="quickControls" class="quick-controls" aria-label="${copy.quickControlsLabel}">
          <div class="quick-controls-title">${copy.quickControlsTitle}</div>
          <div class="quick-controls-grid">
            <button type="button" class="btn secondary" data-control="ctrl-c">Ctrl+C</button>
            <button type="button" class="btn secondary" data-control="ctrl-l">Ctrl+L</button>
            <button type="button" class="btn secondary" data-control="ctrl-d">Ctrl+D</button>
            <button type="button" class="btn secondary" data-control="tab">Tab</button>
            <button type="button" class="btn secondary" data-control="esc">Esc</button>
            <button type="button" class="btn secondary" data-control="backspace" data-repeatable="true">⌫</button>
            <button type="button" class="btn secondary" data-control="enter">Enter</button>
            <button type="button" class="btn secondary" data-control="up" data-repeatable="true">↑</button>
            <button type="button" class="btn secondary" data-control="left" data-repeatable="true">←</button>
            <button type="button" class="btn secondary" data-control="down" data-repeatable="true">↓</button>
            <button type="button" class="btn secondary" data-control="right" data-repeatable="true">→</button>
          </div>
        </div>
        <div id="browserControls" class="browser-controls" aria-label="${copy.browserControlDeckTitle}">
          <div class="quick-controls-title">${copy.browserControlDeckTitle}</div>
          <div class="session-switch-row browser-session-row">
            <select id="browserSessionSelect" class="session-select" data-mobile-browser-session-select aria-label="${copy.browserSessionSelectorLabel}" disabled>
              <option value="">${copy.browserNoSessionsAvailable}</option>
            </select>
          </div>
          <div class="quick-controls-grid browser-controls-grid">
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="back">${copy.browserBackButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="forward">${copy.browserForwardButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="reload">${copy.browserReloadButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-control data-browser-control="toggle-inspect">${copy.browserInspectButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-viewport data-browser-viewport="Responsive">${copy.browserResponsiveButton}</button>
            <button type="button" class="btn secondary" data-mobile-browser-viewport data-browser-viewport="iPhone 14">${copy.browserPhoneButton}</button>
          </div>
          <div id="browserInspectSelection" class="browser-inspect-selection" data-mobile-inspect-selection data-mobile-inspect-selection-raw="">${copy.browserInspectSelectionNone}</div>
          <form id="browserInspectComposer" class="browser-inspect-composer" autocomplete="off">
            <input id="browserInspectInput" type="text" placeholder="${copy.browserInspectInputPlaceholder}" data-mobile-browser-inspect-input />
            <button id="browserInspectSendButton" type="submit" class="btn secondary" data-mobile-browser-inspect-send>${copy.browserInspectSendButton}</button>
          </form>
          <div id="browserControlStatus" class="session-switch-note browser-control-status" data-mobile-browser-status>${copy.browserStatusWaiting}</div>
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      const pairingId = ${JSON.stringify(pairingId)};
      const ui = ${JSON.stringify(copy)};
      const PBKDF2_ITERATIONS = 100000;
      const SALT_LENGTH = 16;
      const IV_LENGTH = 12;
      const CHALLENGE_SALT = new TextEncoder().encode('calder-challenge-v1');

      const otpInput = document.getElementById('otp');
      const connectButton = document.getElementById('connect');
      const statusEl = document.getElementById('status');
      const terminalEl = document.getElementById('terminal');
      const modeBadge = document.getElementById('modeBadge');
      const connBadge = document.getElementById('connBadge');
      const terminalView = document.getElementById('terminalView');
      const controlsView = document.getElementById('controlsView');
      const composer = document.getElementById('composer');
      const commandInput = document.getElementById('commandInput');
      const sendButton = document.getElementById('send');
      const historyPrevButton = document.getElementById('historyPrevButton');
      const historyNextButton = document.getElementById('historyNextButton');
      const commandChipList = document.getElementById('commandChipList');
      const quickControls = document.getElementById('quickControls');
      const browserControls = document.getElementById('browserControls');
      const browserSessionSelect = document.getElementById('browserSessionSelect');
      const browserControlStatus = document.getElementById('browserControlStatus');
      const browserInspectSelection = document.getElementById('browserInspectSelection');
      const browserInspectComposer = document.getElementById('browserInspectComposer');
      const browserInspectInput = document.getElementById('browserInspectInput');
      const browserInspectSendButton = document.getElementById('browserInspectSendButton');
      const terminalClearButton = document.getElementById('terminalClearButton');
      const terminalCopyButton = document.getElementById('terminalCopyButton');
      const terminalFollowButton = document.getElementById('terminalFollowButton');
      const sessionSelect = document.getElementById('sessionSelect');
      const sessionSwitchButton = document.getElementById('sessionSwitchButton');
      const sessionSwitchNote = document.getElementById('sessionSwitchNote');
      const stageChips = Array.from(document.querySelectorAll('[data-mobile-stage-chip]'));
      const shortcutToggleRow = document.getElementById('shortcutToggleRow');
      const shortcutToggleButton = document.getElementById('shortcutToggleButton');
      const shortcutHint = document.getElementById('shortcutHint');
      const viewTabs = Array.from(document.querySelectorAll('[data-mobile-view-tab]'));
      const terminalViewTab = document.querySelector('[data-mobile-view-tab="terminal"]');
      const controlsViewTab = document.querySelector('[data-mobile-view-tab="controls"]');

      let dataChannel = null;
      let currentMode = 'readonly';
      let authenticated = false;
      let passphrase = '';
      let pairingToken = '';
      let quickControlRepeatTimer = null;
      let quickControlRepeatInterval = null;
      let quickControlRepeatControl = null;
      let suppressQuickControlClickUntilMs = 0;
      let activeView = 'terminal';
      let availableSessions = [];
      let activeSessionId = '';
      let switchInFlight = false;
      let availableBrowserSessions = [];
      let activeBrowserSessionId = '';
      let browserControlInFlight = false;
      let browserInspectInFlight = false;
      let followTerminal = true;
      let commandHistory = [];
      let commandHistoryIndex = -1;
      let otpVerified = false;
      let streamReady = false;
      let controlsUnlocked = false;
      let shortcutsExpanded = false;
      const MAX_COMMAND_HISTORY = 40;

      function normalizeOtpValue(raw) {
        return String(raw || '').replace(/\\D/g, '').slice(0, 6);
      }

      function syncOtpUi() {
        const digits = normalizeOtpValue(otpInput.value);
        if (otpInput.value !== digits) {
          otpInput.value = digits;
        }
        connectButton.disabled = digits.length !== 6;
        return digits;
      }

      function formatCopy(template, replacements) {
        if (typeof template !== 'string') return '';
        return template.replace(/\{(\w+)\}/g, function (_match, key) {
          return Object.prototype.hasOwnProperty.call(replacements, key)
            ? String(replacements[key])
            : '';
        });
      }

      function setStatus(message, kind) {
        statusEl.textContent = message;
        statusEl.classList.remove('error', 'ok');
        if (kind === 'error') statusEl.classList.add('error');
        if (kind === 'ok') statusEl.classList.add('ok');
      }

      function setConnState(label) {
        connBadge.textContent = ui.statePrefix + ': ' + label;
      }

      function updateStageChips() {
        for (const chip of stageChips) {
          const stage = chip.getAttribute('data-stage');
          const done = (stage === 'verify' && otpVerified)
            || (stage === 'stream' && streamReady)
            || (stage === 'controls' && controlsUnlocked);
          const active = !done && (
            (stage === 'verify' && !otpVerified)
            || (stage === 'stream' && otpVerified && !streamReady)
            || (stage === 'controls' && streamReady && !controlsUnlocked)
          );
          chip.classList.toggle('done', done);
          chip.classList.toggle('active', active);
          chip.setAttribute('aria-current', active ? 'step' : 'false');
        }
      }

      function updateShortcutHint() {
        if (!shortcutHint) return;
        if (!authenticated) {
          shortcutHint.textContent = ui.shortcutsHiddenUntilReady;
          return;
        }
        if (currentMode !== 'readwrite') {
          shortcutHint.textContent = ui.readonlyHint;
          return;
        }
        shortcutHint.textContent = shortcutsExpanded
          ? ui.repeatInputHint
          : ui.shortcutsHiddenUntilNeeded;
      }

      function setShortcutsExpanded(expanded) {
        const canExpand = canSendInteractiveInput();
        shortcutsExpanded = Boolean(expanded) && canExpand;
        quickControls.classList.toggle('visible', shortcutsExpanded);
        if (shortcutToggleButton) {
          shortcutToggleButton.textContent = shortcutsExpanded ? ui.hideShortcutsButton : ui.showShortcutsButton;
          shortcutToggleButton.setAttribute('aria-expanded', shortcutsExpanded ? 'true' : 'false');
          shortcutToggleButton.classList.toggle('active', shortcutsExpanded);
        }
        updateShortcutHint();
      }

      function updateFollowButton() {
        terminalFollowButton.textContent = followTerminal ? ui.followOnButton : ui.followOffButton;
        terminalFollowButton.classList.toggle('active', followTerminal);
      }

      function setFollowTerminal(enabled) {
        followTerminal = Boolean(enabled);
        updateFollowButton();
        if (followTerminal) {
          terminalEl.scrollTop = terminalEl.scrollHeight;
        }
      }

      function setActiveView(view) {
        activeView = view === 'controls' ? 'controls' : 'terminal';
        if (activeView === 'terminal') {
          stopQuickControlRepeat();
        }
        terminalView.classList.toggle('active', activeView === 'terminal');
        controlsView.classList.toggle('active', activeView === 'controls');
        terminalViewTab.classList.toggle('active', activeView === 'terminal');
        controlsViewTab.classList.toggle('active', activeView === 'controls');
        terminalViewTab.setAttribute('aria-selected', activeView === 'terminal' ? 'true' : 'false');
        controlsViewTab.setAttribute('aria-selected', activeView === 'controls' ? 'true' : 'false');
      }

      function setControlsViewEnabled(enabled) {
        controlsViewTab.disabled = !enabled;
        controlsViewTab.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        if (!enabled && activeView === 'controls') {
          setActiveView('terminal');
        }
      }

      function canSendInteractiveInput() {
        return Boolean(
          authenticated
          && dataChannel
          && dataChannel.readyState === 'open'
          && currentMode === 'readwrite'
        );
      }

      function updateHistoryNavigationState() {
        const interactive = canSendInteractiveInput();
        if (!interactive || commandHistory.length === 0) {
          historyPrevButton.disabled = true;
          historyNextButton.disabled = true;
          return;
        }

        if (commandHistoryIndex < 0) {
          historyPrevButton.disabled = false;
          historyNextButton.disabled = true;
          return;
        }

        historyPrevButton.disabled = commandHistoryIndex >= commandHistory.length - 1;
        historyNextButton.disabled = commandHistoryIndex <= 0;
      }

      function setCommandChipInteractivity(enabled) {
        const chips = commandChipList.querySelectorAll('[data-command-chip]');
        for (const chip of chips) {
          chip.disabled = !enabled;
        }
      }

      function setInteractiveControlsVisible() {
        const visible = canSendInteractiveInput();
        controlsUnlocked = visible;
        if (visible) {
          composer.classList.add('visible');
          commandChipList.classList.add('visible');
          if (shortcutToggleRow) shortcutToggleRow.classList.add('visible');
        } else {
          composer.classList.remove('visible');
          commandChipList.classList.remove('visible');
          if (shortcutToggleRow) shortcutToggleRow.classList.remove('visible');
        }
        setShortcutsExpanded(shortcutsExpanded && visible);
        if (shortcutToggleButton) shortcutToggleButton.disabled = !visible;
        sendButton.disabled = !visible;
        setCommandChipInteractivity(visible);
        updateHistoryNavigationState();
        setControlsViewEnabled(visible);
        updateBrowserControlsUi();
        updateStageChips();
      }

      function sendInputPayload(payload) {
        if (!canSendInteractiveInput()) return false;
        sendMessage({ type: 'input', payload });
        return true;
      }

      function rememberCommand(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) return;
        const existingIndex = commandHistory.indexOf(trimmed);
        if (existingIndex >= 0) {
          commandHistory.splice(existingIndex, 1);
        }
        commandHistory.unshift(trimmed);
        if (commandHistory.length > MAX_COMMAND_HISTORY) {
          commandHistory = commandHistory.slice(0, MAX_COMMAND_HISTORY);
        }
        commandHistoryIndex = -1;
        updateHistoryNavigationState();
      }

      function sendCommandValue(rawValue) {
        const value = String(rawValue || '').trim();
        if (!value) return false;
        if (!sendInputPayload(value + '\\n')) return false;
        rememberCommand(value);
        return true;
      }

      function recallCommand(direction) {
        if (commandHistory.length === 0) return;

        if (commandHistoryIndex < 0) {
          if (direction <= 0) return;
          commandHistoryIndex = 0;
        } else {
          commandHistoryIndex += direction;
          if (commandHistoryIndex < 0) {
            commandHistoryIndex = -1;
            commandInput.value = '';
            updateHistoryNavigationState();
            return;
          }
          if (commandHistoryIndex >= commandHistory.length) {
            commandHistoryIndex = commandHistory.length - 1;
          }
        }

        if (commandHistoryIndex >= 0 && commandHistoryIndex < commandHistory.length) {
          commandInput.value = commandHistory[commandHistoryIndex];
          commandInput.focus();
        }
        updateHistoryNavigationState();
      }

      function quickControlToPayload(control) {
        switch (control) {
          case 'ctrl-c': return '\\u0003';
          case 'ctrl-l': return '\\u000c';
          case 'ctrl-d': return '\\u0004';
          case 'tab': return '\\t';
          case 'esc': return '\\u001b';
          case 'backspace': return '\\u007f';
          case 'enter': return '\\n';
          case 'up': return '\\u001b[A';
          case 'down': return '\\u001b[B';
          case 'right': return '\\u001b[C';
          case 'left': return '\\u001b[D';
          default: return null;
        }
      }

      function triggerQuickControl(control) {
        const payload = quickControlToPayload(control);
        if (!payload) return;
        const sent = sendInputPayload(payload);
        if (sent && control === 'enter') {
          commandInput.focus();
        }
        if (sent) {
          pulseTap(8);
        }
      }

      function isRepeatableControl(control) {
        return control === 'up'
          || control === 'down'
          || control === 'left'
          || control === 'right'
          || control === 'backspace';
      }

      function stopQuickControlRepeat() {
        if (quickControlRepeatTimer) {
          clearTimeout(quickControlRepeatTimer);
          quickControlRepeatTimer = null;
        }
        if (quickControlRepeatInterval) {
          clearInterval(quickControlRepeatInterval);
          quickControlRepeatInterval = null;
        }
        quickControlRepeatControl = null;
      }

      function startQuickControlRepeat(control) {
        stopQuickControlRepeat();
        if (!isRepeatableControl(control)) return;
        quickControlRepeatControl = control;
        quickControlRepeatTimer = setTimeout(function () {
          quickControlRepeatInterval = setInterval(function () {
            if (!quickControlRepeatControl) return;
            triggerQuickControl(quickControlRepeatControl);
          }, 90);
        }, 280);
      }

      function pulseTap(strength) {
        if (typeof navigator.vibrate !== 'function') return;
        navigator.vibrate(strength);
      }

      function appendTerminal(chunk) {
        if (typeof chunk !== 'string' || chunk.length === 0) return;
        terminalEl.textContent += chunk;
        if (terminalEl.textContent.length > 150000) {
          terminalEl.textContent = terminalEl.textContent.slice(-90000);
        }
        if (followTerminal) {
          terminalEl.scrollTop = terminalEl.scrollHeight;
        }
      }

      function replaceTerminal(content) {
        terminalEl.textContent = '';
        if (typeof content === 'string' && content.length > 0) {
          appendTerminal(content);
        }
      }

      function clearTerminalView() {
        replaceTerminal('');
        setStatus(ui.mobileTerminalCleared, 'ok');
      }

      async function copyTerminalView() {
        const text = terminalEl.textContent || '';
        if (!text.trim()) {
          setStatus(ui.nothingToCopyYet, 'error');
          return;
        }
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          setStatus(ui.clipboardApiUnavailable, 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          setStatus(ui.terminalCopied, 'ok');
        } catch {
          setStatus(ui.terminalCopyFailed, 'error');
        }
      }

      function canSwitchSessions() {
        return Boolean(authenticated && dataChannel && dataChannel.readyState === 'open');
      }

      function updateSessionSwitchUi() {
        const canUse = canSwitchSessions();
        const hasSessions = availableSessions.length > 0;
        const selectedId = String(sessionSelect.value || '');
        sessionSelect.disabled = !canUse || !hasSessions || switchInFlight;
        sessionSwitchButton.disabled = !canUse
          || !hasSessions
          || switchInFlight
          || !selectedId
          || selectedId === activeSessionId;
      }

      function describeSessionSwitchState() {
        if (switchInFlight) {
          sessionSwitchNote.textContent = ui.switchingSession;
          return;
        }
        if (!authenticated) {
          sessionSwitchNote.textContent = ui.sessionRoutingUnavailable;
          return;
        }
        if (availableSessions.length === 0) {
          sessionSwitchNote.textContent = ui.noShareableSessions;
          return;
        }
        const active = availableSessions.find((session) => session.id === activeSessionId);
        if (active) {
          sessionSwitchNote.textContent = formatCopy(ui.activeSessionTemplate, { name: active.name });
        } else {
          sessionSwitchNote.textContent = ui.chooseSessionAndSwitch;
        }
      }

      function syncSessionSelectOptions() {
        const priorSelection = String(sessionSelect.value || '');
        sessionSelect.innerHTML = '';
        if (availableSessions.length === 0) {
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = ui.noSessionsAvailable;
          sessionSelect.appendChild(emptyOption);
          sessionSelect.value = '';
          updateSessionSwitchUi();
          describeSessionSwitchState();
          return;
        }

        for (const session of availableSessions) {
          const option = document.createElement('option');
          option.value = session.id;
          option.textContent = session.name;
          sessionSelect.appendChild(option);
        }

        const hasPriorSelection = availableSessions.some((session) => session.id === priorSelection);
        if (hasPriorSelection) {
          sessionSelect.value = priorSelection;
        } else if (availableSessions.some((session) => session.id === activeSessionId)) {
          sessionSelect.value = activeSessionId;
        } else {
          sessionSelect.value = availableSessions[0].id;
        }

        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

      function applySessionCatalog(msg) {
        if (!msg || !Array.isArray(msg.sessions)) return;
        availableSessions = msg.sessions
          .filter((session) => session && typeof session.id === 'string' && typeof session.name === 'string')
          .map((session) => ({ id: session.id, name: session.name }));
        if (typeof msg.activeSessionId === 'string') {
          activeSessionId = msg.activeSessionId;
        }
        syncSessionSelectOptions();
      }

      function applySessionSwitchResult(msg) {
        switchInFlight = false;
        if (!msg || !msg.ok) {
          setStatus(formatCopy(ui.switchFailedTemplate, { reason: (msg && msg.reason) || ui.unknownReason }), 'error');
          updateSessionSwitchUi();
          describeSessionSwitchState();
          return;
        }

        if (typeof msg.sessionId === 'string' && msg.sessionId.length > 0) {
          activeSessionId = msg.sessionId;
        }
        if (typeof msg.scrollback === 'string') {
          replaceTerminal(msg.scrollback);
        }
        if (activeSessionId) {
          sessionSelect.value = activeSessionId;
        }

        const switchedName = typeof msg.sessionName === 'string' && msg.sessionName.length > 0
          ? msg.sessionName
          : activeSessionId;
        setStatus(formatCopy(ui.switchedToTemplate, { name: switchedName }), 'ok');
        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

      function canUseBrowserControls() {
        return canSendInteractiveInput();
      }

      function resolveActiveBrowserSession() {
        if (availableBrowserSessions.length === 0) return null;
        const selectedId = browserSessionSelect
          ? String(browserSessionSelect.value || '').trim()
          : '';
        if (selectedId) {
          const selected = availableBrowserSessions.find((entry) => entry.id === selectedId);
          if (selected) return selected;
        }
        if (activeBrowserSessionId) {
          const active = availableBrowserSessions.find((entry) => entry.id === activeBrowserSessionId);
          if (active) return active;
        }
        return availableBrowserSessions[0] || null;
      }

      function setBrowserControlStatus(message) {
        if (!browserControlStatus) return;
        browserControlStatus.textContent = message;
      }

      function renderBrowserInspectSelection() {
        if (!browserInspectSelection) return;
        const active = resolveActiveBrowserSession();
        const rawSummary = active && typeof active.selectedElementSummary === 'string'
          ? active.selectedElementSummary.trim()
          : '';
        if (rawSummary) {
          browserInspectSelection.textContent = formatCopy(ui.browserInspectSelectionTemplate, { summary: rawSummary });
          browserInspectSelection.setAttribute('data-mobile-inspect-selection-raw', rawSummary);
          return;
        }
        browserInspectSelection.textContent = ui.browserInspectSelectionNone;
        browserInspectSelection.setAttribute('data-mobile-inspect-selection-raw', '');
      }

      function updateBrowserControlsUi() {
        const interactive = canUseBrowserControls();
        if (browserControls) {
          browserControls.classList.toggle('visible', interactive);
        }
        if (!browserSessionSelect) return;

        const hasSessions = availableBrowserSessions.length > 0;
        browserSessionSelect.disabled = !interactive || !hasSessions || browserControlInFlight || browserInspectInFlight;

        const controlButtons = document.querySelectorAll('[data-mobile-browser-control], [data-mobile-browser-viewport]');
        for (const button of controlButtons) {
          button.disabled = !interactive || !hasSessions || browserControlInFlight || browserInspectInFlight;
        }

        const active = resolveActiveBrowserSession();
        const hasInspectSelection = Boolean(
          active
          && typeof active.selectedElementSummary === 'string'
          && active.selectedElementSummary.trim().length > 0,
        );
        renderBrowserInspectSelection();

        if (browserInspectInput instanceof HTMLInputElement) {
          browserInspectInput.disabled = !interactive || !hasSessions || browserControlInFlight || browserInspectInFlight;
        }
        if (browserInspectSendButton instanceof HTMLButtonElement) {
          browserInspectSendButton.disabled = !interactive
            || !hasSessions
            || !hasInspectSelection
            || browserControlInFlight
            || browserInspectInFlight;
        }

        if (browserControlInFlight || browserInspectInFlight) {
          return;
        }

        if (!interactive) {
          setBrowserControlStatus(ui.browserStatusReadonly);
        } else if (!hasSessions) {
          setBrowserControlStatus(ui.browserNoSessionsAvailable);
        } else {
          const activeName = active ? active.name : availableBrowserSessions[0].name;
          setBrowserControlStatus(formatCopy(ui.browserStatusReadyTemplate, { name: activeName }));
        }
      }

      function syncBrowserSessionOptions() {
        if (!browserSessionSelect) return;
        const priorSelection = String(browserSessionSelect.value || '');
        browserSessionSelect.innerHTML = '';
        if (availableBrowserSessions.length === 0) {
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = ui.browserNoSessionsAvailable;
          browserSessionSelect.appendChild(emptyOption);
          browserSessionSelect.value = '';
          updateBrowserControlsUi();
          return;
        }

        for (const session of availableBrowserSessions) {
          const option = document.createElement('option');
          option.value = session.id;
          option.textContent = session.name;
          browserSessionSelect.appendChild(option);
        }

        const hasPriorSelection = availableBrowserSessions.some((entry) => entry.id === priorSelection);
        if (hasPriorSelection) {
          browserSessionSelect.value = priorSelection;
        } else if (availableBrowserSessions.some((entry) => entry.id === activeBrowserSessionId)) {
          browserSessionSelect.value = activeBrowserSessionId;
        } else {
          browserSessionSelect.value = availableBrowserSessions[0].id;
        }
        updateBrowserControlsUi();
      }

      function applyBrowserState(msg) {
        if (!msg || !Array.isArray(msg.sessions)) return;
        availableBrowserSessions = msg.sessions
          .filter((session) =>
            session
            && typeof session.id === 'string'
            && typeof session.name === 'string')
          .map((session) => ({
            id: session.id,
            name: session.name,
            selectedElementSummary: typeof session.selectedElementSummary === 'string'
              ? session.selectedElementSummary
              : '',
          }));
        if (typeof msg.activeBrowserSessionId === 'string') {
          activeBrowserSessionId = msg.activeBrowserSessionId;
        }
        syncBrowserSessionOptions();
      }

      function requestBrowserState() {
        if (!authenticated || !dataChannel || dataChannel.readyState !== 'open') return;
        sendMessage({ type: 'browser-state-request' });
      }

      function sendBrowserControl(action, extra) {
        if (!canUseBrowserControls()) {
          updateBrowserControlsUi();
          return;
        }
        if (!browserSessionSelect) return;
        const selectedSessionId = String(browserSessionSelect.value || '').trim();
        if (!selectedSessionId) {
          setBrowserControlStatus(ui.browserNoSessionsAvailable);
          return;
        }
        browserControlInFlight = true;
        updateBrowserControlsUi();
        setBrowserControlStatus(ui.browserControlApplying);
        const payload = Object.assign(
          {
            type: 'browser-control',
            action,
            sessionId: selectedSessionId,
          },
          extra || {},
        );
        sendMessage(payload);
      }

      function sendBrowserInspectInstruction() {
        if (!canUseBrowserControls()) {
          updateBrowserControlsUi();
          return;
        }
        if (!(browserSessionSelect instanceof HTMLSelectElement) || !(browserInspectInput instanceof HTMLInputElement)) {
          return;
        }
        const selectedSessionId = String(browserSessionSelect.value || '').trim();
        if (!selectedSessionId) {
          setBrowserControlStatus(ui.browserNoSessionsAvailable);
          return;
        }
        const instruction = browserInspectInput.value.trim();
        if (!instruction) {
          setBrowserControlStatus(ui.browserInspectInstructionRequired);
          return;
        }
        const selected = availableBrowserSessions.find((entry) => entry.id === selectedSessionId);
        const hasSelection = Boolean(
          selected
          && typeof selected.selectedElementSummary === 'string'
          && selected.selectedElementSummary.trim().length > 0,
        );
        if (!hasSelection) {
          setBrowserControlStatus(ui.browserInspectNeedSelection);
          return;
        }
        browserInspectInFlight = true;
        updateBrowserControlsUi();
        setBrowserControlStatus(ui.browserInspectSubmitting);
        sendMessage({
          type: 'browser-inspect-submit',
          sessionId: selectedSessionId,
          instruction,
        });
      }

      function applyBrowserControlResult(msg) {
        browserControlInFlight = false;
        updateBrowserControlsUi();
        if (!msg || !msg.ok) {
          setBrowserControlStatus(formatCopy(ui.browserControlFailedTemplate, { reason: (msg && msg.reason) || ui.unknownReason }));
          return;
        }
        const actionLabel = typeof msg.action === 'string' ? msg.action : 'ok';
        setBrowserControlStatus(formatCopy(ui.browserControlSucceededTemplate, { action: actionLabel }));
        requestBrowserState();
      }

      function applyBrowserInspectResult(msg) {
        browserInspectInFlight = false;
        updateBrowserControlsUi();
        if (!msg || !msg.ok) {
          setBrowserControlStatus(formatCopy(ui.browserInspectFailedTemplate, { reason: (msg && msg.reason) || ui.unknownReason }));
          return;
        }
        if (browserInspectInput instanceof HTMLInputElement) {
          browserInspectInput.value = '';
        }
        setBrowserControlStatus(ui.browserInspectSucceeded);
        requestBrowserState();
      }

      function normalizePassphrase(value) {
        return value.trim().replace(/[\\s-]+/g, '').toUpperCase();
      }

      function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        return bytes;
      }

      function bytesToHex(bytes) {
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }

      function hasWebCryptoSupport() {
        const browserCrypto = globalThis.crypto;
        return Boolean(
          browserCrypto
          && typeof browserCrypto.getRandomValues === 'function'
          && browserCrypto.subtle
          && typeof browserCrypto.subtle.importKey === 'function'
        );
      }

      async function deriveAesKey(phrase, salt, usage) {
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(normalizePassphrase(phrase)),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          usage
        );
      }

      async function encryptPayload(plaintext, phrase) {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const key = await deriveAesKey(phrase, salt, ['encrypt']);
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(plaintext)
        );
        const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
        combined.set(salt, 0);
        combined.set(iv, SALT_LENGTH);
        combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
        let binary = '';
        for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
        return btoa(binary);
      }

      async function decryptPayload(encoded, phrase) {
        let bytes;
        try {
          bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        } catch {
          throw new Error(ui.couldNotDecodeConnectionCode);
        }
        if (bytes.length < SALT_LENGTH + IV_LENGTH + 1) {
          throw new Error(ui.connectionCodeTooShort);
        }
        const salt = bytes.slice(0, SALT_LENGTH);
        const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = bytes.slice(SALT_LENGTH + IV_LENGTH);
        try {
          const key = await deriveAesKey(phrase, salt, ['decrypt']);
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
          return new TextDecoder().decode(plain);
        } catch {
          throw new Error(ui.wrongPassphraseOrInvalidCode);
        }
      }

      async function encodeConnectionCode(desc, phrase) {
        return encryptPayload(JSON.stringify(desc), phrase);
      }

      async function decodeConnectionCode(code, expectedType, phrase) {
        const decoded = await decryptPayload(code, phrase);
        let parsed;
        try {
          parsed = JSON.parse(decoded);
        } catch {
          throw new Error(ui.malformedConnectionPayload);
        }
        const envelope = parsed && typeof parsed === 'object' && parsed.v === 2 && parsed.description
          ? parsed.description
          : parsed;
        if (!envelope || typeof envelope !== 'object' || typeof envelope.type !== 'string' || typeof envelope.sdp !== 'string') {
          throw new Error(ui.missingConnectionFields);
        }
        if (expectedType && envelope.type !== expectedType) {
          throw new Error(ui.connectionTypeMismatch);
        }
        return envelope;
      }

      async function computeChallengeResponse(challengeHex, phrase) {
        const challenge = hexToBytes(challengeHex);
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(normalizePassphrase(phrase)),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        const hmacKey = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: CHALLENGE_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', hmacKey, challenge);
        return bytesToHex(new Uint8Array(signature));
      }

      function resolvePairingTokenFromUrl() {
        const url = new URL(window.location.href);
        const queryToken = url.searchParams.get('t');
        if (queryToken) return queryToken;
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        if (!hash) return '';
        const hashParams = new URLSearchParams(hash);
        return hashParams.get('t') || '';
      }

      function resolveNativeBootstrapHint(tokenFromUrl) {
        const scope = window;
        const hint = scope && scope.__CALDER_NATIVE_BOOTSTRAP;
        if (!hint || typeof hint !== 'object') return null;
        if (hint.pairingId && hint.pairingId !== pairingId) return null;
        if (typeof hint.token !== 'string' || hint.token.length === 0) return null;
        if (hint.token !== tokenFromUrl) return null;
        if (!hint.payload || typeof hint.payload !== 'object') return null;
        return {
          token: hint.token,
          payload: hint.payload,
        };
      }

      function waitForIceGathering(pc) {
        return new Promise((resolve) => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
            return;
          }
          const listener = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', listener);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', listener);
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', listener);
            resolve();
          }, 10000);
        });
      }

      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || ('Request failed (' + response.status + ')'));
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return response.json();
        }
        return null;
      }

      async function bootstrapPairing(otpCode, token) {
        return postJson('/api/pair/' + pairingId + '/bootstrap', { token, otp: otpCode });
      }

      async function submitAnswer(payload) {
        await postJson('/api/pair/' + pairingId + '/answer', payload);
      }

      async function requestChallengeResponse(challenge, token) {
        const response = await postJson('/api/pair/' + pairingId + '/challenge', { token, challenge });
        if (!response || typeof response.response !== 'string' || response.response.length === 0) {
          throw new Error(ui.connectionFailed);
        }
        return response.response;
      }

      function sendMessage(payload) {
        if (dataChannel && dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(payload));
        }
      }

      function onAuthenticated() {
        streamReady = true;
        setStatus(ui.connectedLiveStream, 'ok');
        setConnState('connected');
        setInteractiveControlsVisible();
        updateSessionSwitchUi();
        describeSessionSwitchState();
        requestBrowserState();
        updateShortcutHint();
      }

      async function attachDataChannel(channel) {
        dataChannel = channel;
        channel.onopen = function () {
          setConnState('channel-open');
          setStatus(ui.channelOpenWaitingAuth);
        };
        channel.onclose = function () {
          setConnState('closed');
          setStatus(ui.connectionClosed, 'error');
          authenticated = false;
          switchInFlight = false;
          browserControlInFlight = false;
          browserInspectInFlight = false;
          availableBrowserSessions = [];
          activeBrowserSessionId = '';
          streamReady = false;
          controlsUnlocked = false;
          setInteractiveControlsVisible();
          syncBrowserSessionOptions();
          updateSessionSwitchUi();
          describeSessionSwitchState();
          updateShortcutHint();
        };
        channel.onmessage = async function (event) {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }

          if (msg.type === 'auth-challenge') {
            try {
              const response = hasWebCryptoSupport()
                ? await computeChallengeResponse(msg.challenge, passphrase)
                : await requestChallengeResponse(msg.challenge, pairingToken);
              sendMessage({ type: 'auth-response', response });
            } catch (error) {
              setStatus((error && error.message) ? error.message : ui.connectionFailed, 'error');
            }
            return;
          }

          if (msg.type === 'auth-result') {
            if (msg.ok) {
              authenticated = true;
              onAuthenticated();
            } else {
              streamReady = false;
              controlsUnlocked = false;
              setStatus(formatCopy(ui.authFailedTemplate, { reason: msg.reason || ui.unknownReason }), 'error');
              updateStageChips();
              updateShortcutHint();
            }
            return;
          }

          if (!authenticated) return;

          switch (msg.type) {
            case 'init':
              currentMode = msg.mode === 'readwrite' ? 'readwrite' : 'readonly';
              modeBadge.textContent = ui.modePrefix + ': ' + (currentMode === 'readwrite' ? ui.modeReadwrite : ui.modeReadonly);
              replaceTerminal(msg.scrollback || '');
              setInteractiveControlsVisible();
              updateShortcutHint();
              break;
            case 'session-catalog':
              applySessionCatalog(msg);
              break;
            case 'session-switch-result':
              applySessionSwitchResult(msg);
              break;
            case 'browser-state':
              applyBrowserState(msg);
              break;
            case 'browser-control-result':
              applyBrowserControlResult(msg);
              break;
            case 'browser-inspect-result':
              applyBrowserInspectResult(msg);
              break;
            case 'data':
              appendTerminal(msg.payload || '');
              break;
            case 'ping':
              sendMessage({ type: 'pong' });
              break;
            case 'end':
              setStatus(ui.hostEndedSession, 'error');
              streamReady = false;
              controlsUnlocked = false;
              updateStageChips();
              updateShortcutHint();
              break;
          }
        };
      }

      function requestSessionSwitch() {
        if (!canSwitchSessions()) return;
        const targetSessionId = String(sessionSelect.value || '');
        if (!targetSessionId || targetSessionId === activeSessionId) {
          updateSessionSwitchUi();
          return;
        }
        switchInFlight = true;
        updateSessionSwitchUi();
        describeSessionSwitchState();
        sendMessage({ type: 'session-switch', sessionId: targetSessionId });
      }

      function resolveBootstrapOfferDescription(payload) {
        const inlineOffer = payload && typeof payload.offerDescription === 'object'
          ? payload.offerDescription
          : null;
        if (
          inlineOffer
          && inlineOffer.type === 'offer'
          && typeof inlineOffer.sdp === 'string'
          && inlineOffer.sdp.trim().length > 0
        ) {
          return inlineOffer;
        }
        return null;
      }

      function normalizeConnectionDescription(value, expectedType) {
        if (!value || typeof value !== 'object') return null;
        if (value.type !== expectedType) return null;
        if (typeof value.sdp !== 'string' || value.sdp.trim().length === 0) return null;
        return { type: expectedType, sdp: value.sdp };
      }

      async function connectToHost(payload, token) {
        passphrase = payload.passphrase;
        currentMode = payload.mode === 'readwrite' ? 'readwrite' : 'readonly';
        modeBadge.textContent = ui.modePrefix + ': ' + (currentMode === 'readwrite' ? ui.modeReadwrite : ui.modeReadonly);

        const rtcConfig = {
          iceServers: Array.isArray(payload.iceServers) ? payload.iceServers : []
        };
        if (payload.iceTransportPolicy === 'relay') {
          rtcConfig.iceTransportPolicy = 'relay';
        }
        const pc = new RTCPeerConnection(rtcConfig);
        pc.oniceconnectionstatechange = function () {
          setConnState(pc.iceConnectionState);
        };
        pc.ondatachannel = function (event) {
          void attachDataChannel(event.channel);
        };

        const inlineOffer = resolveBootstrapOfferDescription(payload);
        if (!inlineOffer && !hasWebCryptoSupport()) {
          throw new Error(ui.wrongPassphraseOrInvalidCode);
        }
        const remoteDesc = inlineOffer || await decodeConnectionCode(payload.offer, 'offer', passphrase);
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc);

        const answerDesc = normalizeConnectionDescription(pc.localDescription || answer, 'answer');
        if (!answerDesc) {
          throw new Error(ui.missingConnectionFields);
        }
        if (hasWebCryptoSupport()) {
          const answerCode = await encodeConnectionCode(answerDesc, passphrase);
          await submitAnswer({ token, submitToken: payload.submitToken, answer: answerCode });
        } else {
          await submitAnswer({ token, submitToken: payload.submitToken, answerDescription: answerDesc });
        }
        setStatus(ui.answerDelivered);
      }

      async function begin() {
        const token = resolvePairingTokenFromUrl();
        if (!token) {
          setStatus(ui.missingPairingToken, 'error');
          connectButton.disabled = true;
          return;
        }
        pairingToken = token;

        syncOtpUi();
        otpInput.addEventListener('input', function () {
          syncOtpUi();
        });
        otpInput.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (connectButton.disabled) return;
          connectButton.click();
        });

        const nativeBootstrap = resolveNativeBootstrapHint(token);
        if (nativeBootstrap) {
          otpVerified = true;
          streamReady = false;
          controlsUnlocked = false;
          updateStageChips();
          otpInput.value = '';
          otpInput.disabled = true;
          connectButton.disabled = true;
          setStatus(ui.establishingConnection);
          setConnState('authorizing');
          try {
            await connectToHost(nativeBootstrap.payload, nativeBootstrap.token);
            return;
          } catch (error) {
            otpVerified = false;
            otpInput.disabled = false;
            setStatus((error && error.message) ? error.message : ui.connectionFailed, 'error');
            syncOtpUi();
            setConnState('error');
            updateStageChips();
          }
        }

        connectButton.addEventListener('click', async function () {
          const otp = syncOtpUi();
          if (otp.length !== 6) {
            setStatus(ui.enterOtpPrompt, 'error');
            return;
          }

          otpVerified = false;
          streamReady = false;
          controlsUnlocked = false;
          updateStageChips();
          connectButton.disabled = true;
          setStatus(ui.verifyingOtp);
          setConnState('authorizing');

          try {
            const payload = await bootstrapPairing(otp, token);
            otpVerified = true;
            updateStageChips();
            await connectToHost(payload, token);
          } catch (error) {
            setStatus((error && error.message) ? error.message : ui.connectionFailed, 'error');
            syncOtpUi();
            setConnState('error');
            if (!otpVerified) {
              updateStageChips();
            }
          }
        });

        composer.addEventListener('submit', function (event) {
          event.preventDefault();
          const value = String(commandInput.value || '');
          if (!sendCommandValue(value)) return;
          commandInput.value = '';
          pulseTap(10);
        });

        commandInput.addEventListener('keydown', function (event) {
          if (!canSendInteractiveInput()) return;
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            triggerQuickControl('up');
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            triggerQuickControl('down');
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            triggerQuickControl('left');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            triggerQuickControl('right');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            triggerQuickControl('tab');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            triggerQuickControl('esc');
          }
        });

        historyPrevButton.addEventListener('click', function () {
          recallCommand(1);
        });

        historyNextButton.addEventListener('click', function () {
          recallCommand(-1);
        });

        commandChipList.addEventListener('click', function (event) {
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-command-chip]');
          if (!button) return;
          const value = String(button.getAttribute('data-command-chip') || '').trim();
          if (!value) return;
          const sent = sendCommandValue(value);
          if (sent) {
            commandInput.value = '';
            pulseTap(8);
          }
        });

        if (shortcutToggleButton) {
          shortcutToggleButton.addEventListener('click', function () {
            setShortcutsExpanded(!shortcutsExpanded);
          });
        }

        terminalClearButton.addEventListener('click', function () {
          clearTerminalView();
        });

        terminalCopyButton.addEventListener('click', function () {
          void copyTerminalView();
        });

        terminalFollowButton.addEventListener('click', function () {
          setFollowTerminal(!followTerminal);
        });

        terminalEl.addEventListener('scroll', function () {
          if (!followTerminal) return;
          const distanceFromBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight;
          if (distanceFromBottom > 24) {
            setFollowTerminal(false);
          }
        });

        quickControls.addEventListener('pointerdown', function (event) {
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-control]');
          if (!button) return;
          const control = button.getAttribute('data-control');
          if (!control) return;
          suppressQuickControlClickUntilMs = Date.now() + 400;
          triggerQuickControl(control);
          startQuickControlRepeat(control);
        });

        quickControls.addEventListener('pointerup', stopQuickControlRepeat);
        quickControls.addEventListener('pointercancel', stopQuickControlRepeat);
        quickControls.addEventListener('pointerleave', stopQuickControlRepeat);

        quickControls.addEventListener('click', function (event) {
          if (Date.now() < suppressQuickControlClickUntilMs) return;
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-control]');
          if (!button) return;
          const control = button.getAttribute('data-control');
          if (!control) return;
          triggerQuickControl(control);
        });

        sessionSelect.addEventListener('change', function () {
          updateSessionSwitchUi();
        });

        sessionSwitchButton.addEventListener('click', function () {
          requestSessionSwitch();
        });

        if (browserSessionSelect) {
          browserSessionSelect.addEventListener('change', function () {
            activeBrowserSessionId = String(browserSessionSelect.value || '');
            updateBrowserControlsUi();
          });
        }

        if (browserControls) {
          browserControls.addEventListener('click', function (event) {
            const rawTarget = event.target;
            if (!(rawTarget instanceof Element)) return;
            const controlBtn = rawTarget.closest('[data-mobile-browser-control]');
            if (controlBtn) {
              const action = controlBtn.getAttribute('data-browser-control');
              if (!action) return;
              sendBrowserControl(action);
              return;
            }
            const viewportBtn = rawTarget.closest('[data-mobile-browser-viewport]');
            if (!viewportBtn) return;
            const viewportLabel = viewportBtn.getAttribute('data-browser-viewport');
            if (!viewportLabel) return;
            sendBrowserControl('set-viewport', { viewportLabel });
          });
        }

        if (browserInspectComposer) {
          browserInspectComposer.addEventListener('submit', function (event) {
            event.preventDefault();
            sendBrowserInspectInstruction();
          });
        }

        for (const tab of viewTabs) {
          tab.addEventListener('click', function () {
            const view = tab.getAttribute('data-mobile-view-tab');
            if (!view) return;
            if (view === 'controls' && controlsViewTab.disabled) return;
            setActiveView(view);
          });
        }

        setActiveView('terminal');
        setFollowTerminal(true);
        setControlsViewEnabled(false);
        updateStageChips();
        updateShortcutHint();
        syncSessionSelectOptions();
        syncBrowserSessionOptions();
      }

      void begin();
    })();
  </script>
</body>
</html>`;
}

async function handleBootstrapRequest(record: PairingRecord, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const copy = getMobileCopy(record.language);
  if (isExpired(record)) {
    pairings.delete(record.id);
    clearRateLimitEntriesForPairing(record.id);
    sendText(res, 410, copy.serverMessage.pairingExpired);
    return;
  }
  if (isRateLimited(req, record.id, 'bootstrap')) {
    sendText(res, 429, copy.serverMessage.tooManyPairingAttempts);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') {
      sendText(res, 413, copy.serverMessage.requestBodyTooLarge);
      return;
    }
    sendText(res, 400, copy.serverMessage.invalidJsonPayload);
    return;
  }

  const body = (payload ?? {}) as { token?: unknown; otp?: unknown };
  if (!verifyPairingToken(record, body.token)) {
    sendText(res, 403, copy.serverMessage.pairingTokenInvalid);
    return;
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    sendText(res, 429, copy.serverMessage.tooManyOtpAttempts);
    return;
  }

  if (typeof body.otp !== 'string' || body.otp.trim() !== record.otpCode) {
    record.attempts += 1;
    sendText(res, 401, copy.serverMessage.otpMismatch);
    return;
  }

  record.otpVerified = true;
  if (!record.submitToken) {
    record.submitToken = randomBytes(18).toString('hex');
  }

  sendJson(res, 200, {
    offer: record.offer,
    offerDescription: record.offerDescription,
    passphrase: record.passphrase,
    mode: record.mode,
    submitToken: record.submitToken,
    iceServers: record.rtcConfig.iceServers,
    iceTransportPolicy: record.rtcConfig.iceTransportPolicy,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  });
}

async function handleAnswerRequest(record: PairingRecord, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const copy = getMobileCopy(record.language);
  if (isExpired(record)) {
    pairings.delete(record.id);
    clearRateLimitEntriesForPairing(record.id);
    sendText(res, 410, copy.serverMessage.pairingExpired);
    return;
  }
  if (isRateLimited(req, record.id, 'answer')) {
    sendText(res, 429, copy.serverMessage.tooManyAnswerSubmissions);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') {
      sendText(res, 413, copy.serverMessage.requestBodyTooLarge);
      return;
    }
    sendText(res, 400, copy.serverMessage.invalidJsonPayload);
    return;
  }

  const body = (payload ?? {}) as {
    token?: unknown;
    submitToken?: unknown;
    answer?: unknown;
    answerDescription?: unknown;
  };
  if (!verifyPairingToken(record, body.token)) {
    sendText(res, 403, copy.serverMessage.pairingTokenInvalid);
    return;
  }
  if (!record.otpVerified) {
    sendText(res, 403, copy.serverMessage.otpRequiredFirst);
    return;
  }
  if (record.answer) {
    sendText(res, 409, copy.serverMessage.answerAlreadySubmitted);
    return;
  }
  if (typeof body.submitToken !== 'string' || !record.submitToken || !safeCompareToken(record.submitToken, body.submitToken)) {
    sendText(res, 403, copy.serverMessage.submitTokenInvalid);
    return;
  }
  let answerCode: string | null = null;
  if (typeof body.answer === 'string' && body.answer.trim().length > 0) {
    const candidate = body.answer.trim();
    try {
      decodeShareConnectionCode(candidate, record.passphrase, 'answer');
      answerCode = candidate;
    } catch {
      sendText(res, 400, copy.serverMessage.invalidAnswerPayload);
      return;
    }
  } else {
    const answerDescription = normalizeShareConnectionDescription(body.answerDescription, 'answer');
    if (answerDescription) {
      answerCode = encodeShareConnectionDescription(answerDescription, record.passphrase);
    }
  }
  if (!answerCode) {
    sendText(res, 400, copy.serverMessage.missingAnswerPayload);
    return;
  }

  record.answer = answerCode;
  record.submitToken = null;
  res.writeHead(204, { 'cache-control': 'no-store' });
  res.end();
}

async function handleChallengeRequest(record: PairingRecord, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const copy = getMobileCopy(record.language);
  if (isExpired(record)) {
    pairings.delete(record.id);
    clearRateLimitEntriesForPairing(record.id);
    sendText(res, 410, copy.serverMessage.pairingExpired);
    return;
  }
  if (isRateLimited(req, record.id, 'challenge')) {
    sendText(res, 429, copy.serverMessage.tooManyChallengeRequests);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') {
      sendText(res, 413, copy.serverMessage.requestBodyTooLarge);
      return;
    }
    sendText(res, 400, copy.serverMessage.invalidJsonPayload);
    return;
  }

  const body = (payload ?? {}) as { token?: unknown; challenge?: unknown };
  if (!verifyPairingToken(record, body.token)) {
    sendText(res, 403, copy.serverMessage.pairingTokenInvalid);
    return;
  }
  if (!record.otpVerified) {
    sendText(res, 403, copy.serverMessage.otpRequiredFirst);
    return;
  }
  if (typeof body.challenge !== 'string' || body.challenge.trim().length === 0) {
    sendText(res, 400, copy.serverMessage.missingChallengePayload);
    return;
  }
  const challenge = body.challenge.trim();
  if (!isHexString(challenge)) {
    sendText(res, 400, copy.serverMessage.invalidChallengePayload);
    return;
  }

  const response = computeShareChallengeResponse(challenge, record.passphrase);
  sendJson(res, 200, { response });
}

function ensureServerHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  cleanupExpiredPairings();

  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  const requestLanguage = getRequestLanguage(url, req);
  const requestCopy = getMobileCopy(requestLanguage);

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET') {
    if (!pathname.startsWith('/m/')) {
      sendText(res, 404, requestCopy.serverMessage.routeNotFound);
      return;
    }
    const record = getPagePairing(pathname);
    if (!record) {
      sendText(res, 404, requestCopy.serverMessage.pairingNotFound);
      return;
    }
    const copy = getMobileCopy(record.language);
    if (isExpired(record)) {
      pairings.delete(record.id);
      clearRateLimitEntriesForPairing(record.id);
      sendText(res, 410, copy.serverMessage.pairingExpired);
      return;
    }
    if (record.accessMode === 'lan' && !verifyPairingToken(record, url.searchParams.get('t'))) {
      sendText(res, 403, copy.serverMessage.invalidPairingTokenPage);
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(renderMobilePage(record.id, record.language));
    return;
  }

  if (req.method === 'POST') {
    const bootstrapRecord = getPairingFromPath(pathname, '/bootstrap');
    if (bootstrapRecord) {
      void handleBootstrapRequest(bootstrapRecord, req, res);
      return;
    }
    const challengeRecord = getPairingFromPath(pathname, '/challenge');
    if (challengeRecord) {
      void handleChallengeRequest(challengeRecord, req, res);
      return;
    }
    const answerRecord = getPairingFromPath(pathname, '/answer');
    if (answerRecord) {
      void handleAnswerRequest(answerRecord, req, res);
      return;
    }
  }

  sendText(res, 404, requestCopy.serverMessage.routeNotFound);
}

async function ensureBridgeStarted(): Promise<MobileBridgeState> {
  if (bridgeState) return bridgeState;

  const hosts = listLanHosts();
  const host = hosts[0] ?? pickLanHost();
  const server = http.createServer((req, res) => ensureServerHandler(req, res));
  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const value = server.address();
      if (!value || typeof value === 'string') {
        reject(new Error('Mobile control bridge failed to bind port.'));
        return;
      }
      resolve(value);
    });
  });

  const cleanupTimer = setInterval(cleanupExpiredPairings, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  bridgeState = {
    server,
    port: address.port,
    host,
    hosts,
    cleanupTimer,
  };
  return bridgeState;
}

export async function createMobileControlPairing(
  options: MobileControlPairingOptions,
): Promise<MobileControlPairingResult> {
  const state = await ensureBridgeStarted();
  cleanupExpiredPairings();
  const rtcConfig = resolveShareRtcConfigFromEnv();
  const publicBaseUrl = resolveMobilePublicBaseUrl();
  const accessMode: 'lan' | 'remote' = publicBaseUrl ? 'remote' : 'lan';

  const now = Date.now();
  const requestedTtl = options.ttlMs;
  const ttlMs = typeof requestedTtl === 'number' && Number.isFinite(requestedTtl) && requestedTtl > 0
    ? requestedTtl
    : DEFAULT_TTL_MS;
  const language = normalizeMobileLanguage(options.language);
  const offerDescription = normalizeShareConnectionDescription(options.offerDescription, 'offer');
  const record: PairingRecord = {
    id: randomBytes(12).toString('hex'),
    sessionId: options.sessionId,
    offer: options.offer,
    offerDescription,
    passphrase: options.passphrase,
    mode: options.mode,
    accessMode,
    token: randomBytes(20).toString('hex'),
    otpCode: createOtpCode(),
    attempts: 0,
    otpVerified: false,
    submitToken: null,
    answer: null,
    answerConsumed: false,
    language,
    rtcConfig: {
      iceServers: rtcConfig.iceServers,
      iceTransportPolicy: rtcConfig.iceTransportPolicy,
    },
    createdAtMs: now,
    expiresAtMs: now + ttlMs,
  };
  pairings.set(record.id, record);

  const localPairingUrls = Array.from(
    new Set(
      (state.hosts.length > 0 ? state.hosts : [state.host]).map((host) => {
        const localUrl = new URL(`http://${host}:${state.port}/m/${record.id}`);
        localUrl.searchParams.set('t', record.token);
        if (record.language === 'tr') {
          localUrl.searchParams.set('lang', 'tr');
        }
        return localUrl.toString();
      }),
    ),
  );
  const localPairingUrl = localPairingUrls[0] ?? (() => {
    const fallback = new URL(`http://${state.host}:${state.port}/m/${record.id}`);
    fallback.searchParams.set('t', record.token);
    if (record.language === 'tr') {
      fallback.searchParams.set('lang', 'tr');
    }
    return fallback.toString();
  })();
  const pairingUrl = publicBaseUrl
    ? buildPairingUrl(publicBaseUrl, record.id, record.token, 'fragment', true, record.language)
    : localPairingUrl;

  return {
    pairingId: record.id,
    pairingUrl,
    localPairingUrl,
    localPairingUrls,
    accessMode,
    otpCode: record.otpCode,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  };
}

export function consumeMobileControlPairingAnswer(pairingId: string): MobileControlAnswerResult {
  const record = pairings.get(pairingId);
  if (!record) return { answer: null, status: 'expired' };
  if (isExpired(record)) {
    pairings.delete(pairingId);
    clearRateLimitEntriesForPairing(pairingId);
    return { answer: null, status: 'expired' };
  }
  if (!record.answer) return { answer: null, status: 'pending' };
  if (record.answerConsumed) return { answer: null, status: 'expired' };
  record.answerConsumed = true;
  const answer = record.answer;
  return { answer, status: 'ready' };
}

export function revokeMobileControlPairing(pairingId: string): void {
  pairings.delete(pairingId);
  clearRateLimitEntriesForPairing(pairingId);
}

export async function stopMobileControlBridge(): Promise<void> {
  if (!bridgeState) return;
  const current = bridgeState;
  bridgeState = null;
  clearInterval(current.cleanupTimer);
  pairings.clear();
  requestRateLimits.clear();
  await new Promise<void>((resolve) => current.server.close(() => resolve()));
}

export const _internal = {
  isPrivateIpv4,
  parseIpv4ToInt,
  isInvalidIpv4HostAddress,
  listLanHosts,
};
