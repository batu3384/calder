import type { UiLanguage } from '../../shared/types/provider.js';

export type ShareDialogLanguage = 'en' | 'tr';

export type ShareDialogCopy = {
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

export function resolveShareDialogLanguage(language: UiLanguage | undefined): ShareDialogLanguage {
  return language === 'tr' ? 'tr' : 'en';
}

export function getShareDialogCopy(language: ShareDialogLanguage): ShareDialogCopy {
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

export function localizePassphraseError(error: string, language: ShareDialogLanguage): string {
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
