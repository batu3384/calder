import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewRef } from 'react-native-webview';
import { bootstrapPairing, normalizePairingUrl, parsePairingLink } from './src/services/pairing';
import { palette, spacing } from './src/theme';

type UiLanguage = 'en' | 'tr';
type MobileTab = 'overview' | 'sessions' | 'cli' | 'browser' | 'inspect' | 'live';
type ConnectionState = 'idle' | 'waiting' | 'connected' | 'error';
type LiveSessionItem = { id: string; name: string };

type Copy = {
  appTitle: string;
  appSubtitle: string;
  pairingLinkLabel: string;
  pairingLinkPlaceholder: string;
  otpLabel: string;
  otpPlaceholder: string;
  connectButton: string;
  connectInProgress: string;
  openLiveControl: string;
  hideLiveControl: string;
  languageButton: string;
  tabs: Record<MobileTab, string>;
  idleStatus: string;
  waitingStatus: string;
  connectedStatus: string;
  errorStatus: string;
  liveStatusLabel: string;
  liveConnectionLabel: string;
  liveConsoleWaiting: string;
  liveConnectionWaiting: string;
  liveSessionLabel: string;
  liveSessionEmpty: string;
  switchSessionButton: string;
  switchSessionHint: string;
  commandLabel: string;
  commandPlaceholder: string;
  sendCommandButton: string;
  quickControlsLabel: string;
  quickControlCtrlC: string;
  quickControlCtrlL: string;
  quickControlEnter: string;
  quickControlTab: string;
  browserSessionLabel: string;
  browserStatusWaiting: string;
  browserBackButton: string;
  browserForwardButton: string;
  browserReloadButton: string;
  browserInspectButton: string;
  browserResponsiveButton: string;
  browserPhoneButton: string;
  inspectPhaseHint: string;
  inspectSelectionLabel: string;
  inspectSelectionNone: string;
  inspectInstructionLabel: string;
  inspectInstructionPlaceholder: string;
  inspectSendButton: string;
  sectionTitle: Record<MobileTab, string>;
  sectionCopy: Record<MobileTab, string>;
};

const COPY: Record<UiLanguage, Copy> = {
  en: {
    appTitle: 'Calder Mobile',
    appSubtitle: 'Native control companion for sessions, CLI routing, browser tools, and inspect workflows.',
    pairingLinkLabel: 'Desktop pairing link',
    pairingLinkPlaceholder: 'https://.../m/<pairing-id>?t=<token>',
    otpLabel: 'One-time code',
    otpPlaceholder: '123456',
    connectButton: 'Bootstrap Connection',
    connectInProgress: 'Connecting...',
    openLiveControl: 'Open Live Control',
    hideLiveControl: 'Hide Live Control',
    languageButton: 'TR',
    tabs: {
      overview: 'Overview',
      sessions: 'Sessions',
      cli: 'CLI',
      browser: 'Browser',
      inspect: 'Inspect',
      live: 'Live',
    },
    idleStatus: 'Idle',
    waitingStatus: 'Waiting',
    connectedStatus: 'Connected',
    errorStatus: 'Error',
    liveStatusLabel: 'Console status',
    liveConnectionLabel: 'Connection',
    liveConsoleWaiting: 'Waiting for live console telemetry...',
    liveConnectionWaiting: 'Waiting for connection telemetry...',
    liveSessionLabel: 'Live sessions',
    liveSessionEmpty: 'No live sessions yet. Open Live tab and wait for session catalog.',
    switchSessionButton: 'Switch Session',
    switchSessionHint: 'Select a session and switch through the live channel.',
    commandLabel: 'Command deck',
    commandPlaceholder: 'Type command to send into active session',
    sendCommandButton: 'Send Command',
    quickControlsLabel: 'Quick controls',
    quickControlCtrlC: 'Ctrl+C',
    quickControlCtrlL: 'Ctrl+L',
    quickControlEnter: 'Enter',
    quickControlTab: 'Tab',
    browserSessionLabel: 'Browser sessions',
    browserStatusWaiting: 'Waiting for browser control status...',
    browserBackButton: 'Back',
    browserForwardButton: 'Forward',
    browserReloadButton: 'Reload',
    browserInspectButton: 'Inspect',
    browserResponsiveButton: 'Responsive',
    browserPhoneButton: 'iPhone 14',
    inspectPhaseHint: 'Toggle inspect mode from mobile and follow status updates instantly.',
    inspectSelectionLabel: 'Selected element',
    inspectSelectionNone: 'No inspect selection yet. Enable inspect and tap an element first.',
    inspectInstructionLabel: 'Inspect instruction',
    inspectInstructionPlaceholder: 'Describe what should be done for this element',
    inspectSendButton: 'Send Inspect Prompt',
    sectionTitle: {
      overview: 'Control Overview',
      sessions: 'Session Control',
      cli: 'CLI Routing',
      browser: 'Browser Controls',
      inspect: 'Inspect Bridge',
      live: 'Live Control Console',
    },
    sectionCopy: {
      overview: 'Shows desktop health, active device trust, and control readiness in one place.',
      sessions: 'List sessions, switch active session, and send input without leaving mobile.',
      cli: 'Choose provider target and route prompts to the selected CLI session.',
      browser: 'Trigger browser quick actions and monitor viewport state from phone.',
      inspect: 'Start inspect mode, review selected element metadata, and send context to session.',
      live: 'Runs Calder desktop mobile control page inside the native app for full realtime terminal control.',
    },
  },
  tr: {
    appTitle: 'Calder Mobil',
    appSubtitle: 'Oturumlar, CLI yonlendirme, tarayici araclari ve inspect akislari icin native kontrol esligi.',
    pairingLinkLabel: 'Masaustu eslestirme baglantisi',
    pairingLinkPlaceholder: 'https://.../m/<pairing-id>?t=<token>',
    otpLabel: 'Tek kullanimlik kod',
    otpPlaceholder: '123456',
    connectButton: 'Baglantiyi Baslat',
    connectInProgress: 'Baglaniyor...',
    openLiveControl: 'Canli Kontrolu Ac',
    hideLiveControl: 'Canli Kontrolu Gizle',
    languageButton: 'EN',
    tabs: {
      overview: 'Genel',
      sessions: 'Oturumlar',
      cli: 'CLI',
      browser: 'Tarayici',
      inspect: 'Inspect',
      live: 'Canli',
    },
    idleStatus: 'Hazir',
    waitingStatus: 'Bekliyor',
    connectedStatus: 'Bagli',
    errorStatus: 'Hata',
    liveStatusLabel: 'Konsol durumu',
    liveConnectionLabel: 'Baglanti',
    liveConsoleWaiting: 'Canli konsol telemetrisi bekleniyor...',
    liveConnectionWaiting: 'Baglanti telemetrisi bekleniyor...',
    liveSessionLabel: 'Canli oturumlar',
    liveSessionEmpty: 'Henuz canli oturum yok. Canli sekmesini acip katalogu bekleyin.',
    switchSessionButton: 'Oturumu Degistir',
    switchSessionHint: 'Bir oturum secip canli kanal uzerinden degistirin.',
    commandLabel: 'Komut paneli',
    commandPlaceholder: 'Aktif oturuma gonderilecek komutu yazin',
    sendCommandButton: 'Komut Gonder',
    quickControlsLabel: 'Hizli kontroller',
    quickControlCtrlC: 'Ctrl+C',
    quickControlCtrlL: 'Ctrl+L',
    quickControlEnter: 'Enter',
    quickControlTab: 'Tab',
    browserSessionLabel: 'Tarayici oturumlari',
    browserStatusWaiting: 'Tarayici kontrol durumu bekleniyor...',
    browserBackButton: 'Geri',
    browserForwardButton: 'Ileri',
    browserReloadButton: 'Yenile',
    browserInspectButton: 'Inspect',
    browserResponsiveButton: 'Responsive',
    browserPhoneButton: 'iPhone 14',
    inspectPhaseHint: 'Inspect modunu mobilden acip kapatabilir ve durumu anlik izleyebilirsiniz.',
    inspectSelectionLabel: 'Secili element',
    inspectSelectionNone: 'Henuz inspect secimi yok. Once inspect modunda bir elemana dokunun.',
    inspectInstructionLabel: 'Inspect talimati',
    inspectInstructionPlaceholder: 'Bu element icin ne yapilacagini yazin',
    inspectSendButton: 'Inspect Prompt Gonder',
    sectionTitle: {
      overview: 'Kontrol Ozeti',
      sessions: 'Oturum Kontrolu',
      cli: 'CLI Yonlendirme',
      browser: 'Tarayici Kontrolleri',
      inspect: 'Inspect Koprusu',
      live: 'Canli Kontrol Konsolu',
    },
    sectionCopy: {
      overview: 'Masaustu saglik durumu, guvenilen cihaz ve kontrol hazir olma bilgisini tek yerde gosterir.',
      sessions: 'Mobilden cikmadan oturum listesi, aktif oturum degistirme ve giris gonderme.',
      cli: 'Saglayici hedefini secip promptlari secilen CLI oturumuna yonlendir.',
      browser: 'Telefondan tarayici hizli aksiyonlarini tetikle ve viewport durumunu izle.',
      inspect: 'Inspect modunu baslat, secili element bilgisini gor ve oturuma baglam gonder.',
      live: 'Calder masaustu mobil kontrol sayfasini native uygulama icinde calistirarak canli terminal kontrolu saglar.',
    },
  },
};

const TAB_ORDER: MobileTab[] = ['overview', 'sessions', 'cli', 'browser', 'inspect', 'live'];

const WEBVIEW_STATUS_BRIDGE = `
(() => {
  const post = (payload) => {
    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
    } catch {}
  };

  const postStatus = () => {
    try {
      const statusText = document.getElementById('status')?.textContent?.trim() ?? '';
      const connText = document.getElementById('connBadge')?.textContent?.trim() ?? '';
      const modeText = document.getElementById('modeBadge')?.textContent?.trim() ?? '';
      post({
        type: 'mobile_status',
        status: statusText,
        conn: connText,
        mode: modeText,
      });
    } catch {}
  };

  const postSessionCatalog = () => {
    try {
      const select = document.querySelector('[data-mobile-session-select]');
      const switchNote = document.getElementById('sessionSwitchNote')?.textContent?.trim() ?? '';
      if (!(select instanceof HTMLSelectElement)) {
        post({
          type: 'session_catalog',
          sessions: [],
          selectedSessionId: '',
          switchNote,
        });
        return;
      }
      const sessions = Array.from(select.options)
        .map((option) => ({
          id: String(option.value || '').trim(),
          name: String(option.textContent || '').trim(),
        }))
        .filter((session) => session.id.length > 0);
      post({
        type: 'session_catalog',
        sessions,
        selectedSessionId: String(select.value || ''),
        switchNote,
      });
    } catch {}
  };

  const postBrowserCatalog = () => {
    try {
      const select = document.querySelector('[data-mobile-browser-session-select]');
      const statusText = document.querySelector('[data-mobile-browser-status]')?.textContent?.trim() ?? '';
      const inspectSelectionEl = document.querySelector('[data-mobile-inspect-selection]');
      const inspectSelectionText = inspectSelectionEl instanceof HTMLElement
        ? String(inspectSelectionEl.getAttribute('data-mobile-inspect-selection-raw') || inspectSelectionEl.textContent || '').trim()
        : '';
      if (!(select instanceof HTMLSelectElement)) {
        post({
          type: 'browser_catalog',
          sessions: [],
          selectedSessionId: '',
          status: statusText,
          inspectSelection: inspectSelectionText,
        });
        return;
      }
      const sessions = Array.from(select.options)
        .map((option) => ({
          id: String(option.value || '').trim(),
          name: String(option.textContent || '').trim(),
        }))
        .filter((session) => session.id.length > 0);
      post({
        type: 'browser_catalog',
        sessions,
        selectedSessionId: String(select.value || ''),
        status: statusText,
        inspectSelection: inspectSelectionText,
      });
    } catch {}
  };

  const postAll = () => {
    postStatus();
    postSessionCatalog();
    postBrowserCatalog();
  };

  postAll();
  const opts = { childList: true, subtree: true, characterData: true };
  const statusEl = document.getElementById('status');
  const connEl = document.getElementById('connBadge');
  const modeEl = document.getElementById('modeBadge');
  const selectEl = document.querySelector('[data-mobile-session-select]');
  const browserSelectEl = document.querySelector('[data-mobile-browser-session-select]');
  const browserStatusEl = document.querySelector('[data-mobile-browser-status]');
  const inspectSelectionEl = document.querySelector('[data-mobile-inspect-selection]');
  const switchNoteEl = document.getElementById('sessionSwitchNote');
  if (statusEl) new MutationObserver(postStatus).observe(statusEl, opts);
  if (connEl) new MutationObserver(postStatus).observe(connEl, opts);
  if (modeEl) new MutationObserver(postStatus).observe(modeEl, opts);
  if (selectEl) {
    selectEl.addEventListener('change', () => {
      setTimeout(postSessionCatalog, 0);
    });
    new MutationObserver(postSessionCatalog).observe(selectEl, opts);
  }
  if (browserSelectEl) {
    browserSelectEl.addEventListener('change', () => {
      setTimeout(postBrowserCatalog, 0);
    });
    new MutationObserver(postBrowserCatalog).observe(browserSelectEl, opts);
  }
  if (browserStatusEl) {
    new MutationObserver(postBrowserCatalog).observe(browserStatusEl, opts);
  }
  if (inspectSelectionEl) {
    new MutationObserver(postBrowserCatalog).observe(inspectSelectionEl, opts);
  }
  if (switchNoteEl) {
    new MutationObserver(postSessionCatalog).observe(switchNoteEl, opts);
  }
  window.addEventListener('load', () => {
    setTimeout(postAll, 140);
  });
})();
true;
`;

function statusColor(state: ConnectionState): string {
  if (state === 'connected') return palette.success;
  if (state === 'waiting') return palette.warning;
  if (state === 'error') return palette.danger;
  return palette.textMuted;
}

function inferConnectionStateFromText(value: string): ConnectionState {
  const text = value.toLowerCase();
  if (!text) return 'idle';
  if (
    text.includes('connected')
    || text.includes('bagli')
    || text.includes('bağlı')
    || text.includes('aktif')
  ) {
    return 'connected';
  }
  if (
    text.includes('waiting')
    || text.includes('authoriz')
    || text.includes('verifying')
    || text.includes('bekli')
    || text.includes('dogrul')
    || text.includes('doğrul')
  ) {
    return 'waiting';
  }
  if (
    text.includes('failed')
    || text.includes('error')
    || text.includes('hata')
    || text.includes('mismatch')
  ) {
    return 'error';
  }
  return 'idle';
}

function buildNativeBootstrapInjection(
  pairingLink: string | null,
  payload: unknown,
): string {
  if (!pairingLink || !payload || typeof payload !== 'object') {
    return 'true;';
  }
  const parsed = parsePairingLink(pairingLink);
  if (!parsed) return 'true;';

  const envelope = {
    pairingId: parsed.pairingId,
    token: parsed.token,
    payload,
  };
  return `window.__CALDER_NATIVE_BOOTSTRAP = ${JSON.stringify(envelope)}; true;`;
}

export default function App() {
  const liveWebViewRef = useRef<WebViewRef | null>(null);
  const [language, setLanguage] = useState<UiLanguage>('en');
  const [activeTab, setActiveTab] = useState<MobileTab>('overview');
  const [pairingLink, setPairingLink] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [liveControlUrl, setLiveControlUrl] = useState<string | null>(null);
  const [liveControlVisible, setLiveControlVisible] = useState(false);
  const [liveConsoleStatus, setLiveConsoleStatus] = useState('');
  const [liveConnectionStatus, setLiveConnectionStatus] = useState('');
  const [liveSessions, setLiveSessions] = useState<LiveSessionItem[]>([]);
  const [selectedLiveSessionId, setSelectedLiveSessionId] = useState('');
  const [liveSwitchNote, setLiveSwitchNote] = useState('');
  const [liveBrowserSessions, setLiveBrowserSessions] = useState<LiveSessionItem[]>([]);
  const [selectedBrowserSessionId, setSelectedBrowserSessionId] = useState('');
  const [browserStatusLine, setBrowserStatusLine] = useState('');
  const [inspectSelectionLine, setInspectSelectionLine] = useState('');
  const [inspectInstructionDraft, setInspectInstructionDraft] = useState('');
  const [commandDraft, setCommandDraft] = useState('');
  const [bootstrapPayload, setBootstrapPayload] = useState<unknown>(null);

  const copy = COPY[language];
  const statusText = connectionState === 'connected'
    ? copy.connectedStatus
    : connectionState === 'waiting'
      ? copy.waitingStatus
      : connectionState === 'error'
        ? copy.errorStatus
        : copy.idleStatus;

  const bootstrapInjection = buildNativeBootstrapInjection(
    liveControlUrl,
    bootstrapPayload,
  );

  const openLiveControl = (urlFromInput?: string | null): boolean => {
    const normalized = normalizePairingUrl(urlFromInput ?? pairingLink);
    if (!normalized) {
      setConnectionState('error');
      setMessage(
        language === 'tr'
          ? 'Canli kontrol icin gecerli bir pairing link girin.'
          : 'Enter a valid pairing link to open live control.',
      );
      return false;
    }
    setLiveControlUrl(normalized);
    setLiveControlVisible(true);
    setActiveTab('live');
    return true;
  };

  const runInLiveWebView = (script: string): boolean => {
    const webView = liveWebViewRef.current;
    if (!webView || !liveControlVisible) return false;
    webView.injectJavaScript(`${script}\ntrue;`);
    return true;
  };

  const switchLiveSession = (sessionId: string): void => {
    const normalized = sessionId.trim();
    if (!normalized) return;
    const payload = JSON.stringify(normalized);
    const ok = runInLiveWebView(`(() => {
      const select = document.querySelector('[data-mobile-session-select]');
      const button = document.querySelector('[data-mobile-session-switch]');
      if (!(select instanceof HTMLSelectElement) || !(button instanceof HTMLElement)) return;
      select.value = ${payload};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      button.click();
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Canli kanal acik degil. Once Canli kontrolu acin.'
          : 'Live channel is not open yet. Open Live control first.',
      );
      return;
    }
    setSelectedLiveSessionId(normalized);
  };

  const sendCommandToLiveSession = (): void => {
    const command = commandDraft.trim();
    if (!command) return;
    const payload = JSON.stringify(command);
    const ok = runInLiveWebView(`(() => {
      const input = document.getElementById('commandInput');
      const composer = document.getElementById('composer');
      if (!(input instanceof HTMLInputElement) || !(composer instanceof HTMLFormElement)) return;
      input.value = ${payload};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Komut gonderilemedi. Canli kontrol baglantisini kontrol edin.'
          : 'Command could not be sent. Check live control connectivity.',
      );
      return;
    }
    setCommandDraft('');
  };

  const triggerQuickControl = (control: 'ctrl-c' | 'ctrl-l' | 'enter' | 'tab'): void => {
    const payload = JSON.stringify(control);
    const ok = runInLiveWebView(`(() => {
      const value = ${payload};
      const selector = '[data-control="' + value + '"]';
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Hizli kontrol gonderilemedi. Canli kanal aktif degil.'
          : 'Quick control could not be sent. Live channel is not active.',
      );
    }
  };

  const switchBrowserSession = (sessionId: string): void => {
    const normalized = sessionId.trim();
    if (!normalized) return;
    const payload = JSON.stringify(normalized);
    const ok = runInLiveWebView(`(() => {
      const select = document.querySelector('[data-mobile-browser-session-select]');
      if (!(select instanceof HTMLSelectElement)) return;
      select.value = ${payload};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Tarayici oturumu degistirilemedi. Once canli kontrolu acin.'
          : 'Browser session could not be switched. Open Live control first.',
      );
      return;
    }
    setSelectedBrowserSessionId(normalized);
  };

  const sendBrowserControl = (action: 'back' | 'forward' | 'reload' | 'toggle-inspect'): void => {
    const payload = JSON.stringify(action);
    const ok = runInLiveWebView(`(() => {
      const actionValue = ${payload};
      const selector = '[data-mobile-browser-control][data-browser-control="' + actionValue + '"]';
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Tarayici aksiyonu gonderilemedi. Canli kanal aktif degil.'
          : 'Browser action could not be sent. Live channel is not active.',
      );
    }
  };

  const sendBrowserViewport = (label: 'Responsive' | 'iPhone 14'): void => {
    const payload = JSON.stringify(label);
    const ok = runInLiveWebView(`(() => {
      const viewportLabel = ${payload};
      const selector = '[data-mobile-browser-viewport][data-browser-viewport="' + viewportLabel + '"]';
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Viewport aksiyonu gonderilemedi. Canli kanal aktif degil.'
          : 'Viewport action could not be sent. Live channel is not active.',
      );
    }
  };

  const sendInspectPrompt = (): void => {
    const instruction = inspectInstructionDraft.trim();
    if (!instruction) {
      setMessage(
        language === 'tr'
          ? 'Inspect talimati bos olamaz.'
          : 'Inspect instruction cannot be empty.',
      );
      return;
    }
    const payload = JSON.stringify(instruction);
    const ok = runInLiveWebView(`(() => {
      const input = document.getElementById('browserInspectInput');
      const form = document.getElementById('browserInspectComposer');
      if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return;
      input.value = ${payload};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })();`);
    if (!ok) {
      setMessage(
        language === 'tr'
          ? 'Inspect prompt gonderilemedi. Canli kanal aktif degil.'
          : 'Inspect prompt could not be sent. Live channel is not active.',
      );
      return;
    }
    setInspectInstructionDraft('');
  };

  const onConnect = async () => {
    setBusy(true);
    setConnectionState('waiting');
    setMessage('');

    const result = await bootstrapPairing(pairingLink, otpCode);
    if (result.ok) {
      setConnectionState('connected');
      setBootstrapPayload(result.response);
      const opened = openLiveControl(pairingLink);
      if (opened) {
        setMessage(
          language === 'tr'
            ? 'Bootstrap basarili. Canli kontrol ekrani acildi.'
            : 'Bootstrap succeeded. Live control view opened.',
        );
      } else {
        setMessage(
          language === 'tr'
            ? 'Bootstrap basarili. Simdi gecerli pairing link ile canli kontrolu acabilirsiniz.'
            : 'Bootstrap succeeded. You can now open live control with a valid pairing link.',
        );
      }
    } else {
      setConnectionState('error');
      setMessage(result.error);
    }
    setBusy(false);
  };

  const onWebViewMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    try {
      const payload = JSON.parse(raw) as {
        type?: string;
        status?: string;
        conn?: string;
        sessions?: Array<{ id?: string; name?: string }>;
        selectedSessionId?: string;
        switchNote?: string;
        selectedBrowserSessionId?: string;
        inspectSelection?: string;
      };
      if (payload.type === 'mobile_status') {
        const nextConsole = String(payload.status ?? '').trim();
        const nextConn = String(payload.conn ?? '').trim();
        setLiveConsoleStatus(nextConsole);
        setLiveConnectionStatus(nextConn);
        const inferredState = inferConnectionStateFromText(`${nextConsole} ${nextConn}`);
        setConnectionState(inferredState);
        return;
      }
      if (payload.type === 'session_catalog') {
        const sessions = Array.isArray(payload.sessions)
          ? payload.sessions
            .map((entry) => ({
              id: String(entry?.id ?? '').trim(),
              name: String(entry?.name ?? '').trim(),
            }))
            .filter((entry) => entry.id.length > 0)
          : [];
        setLiveSessions(sessions);
        const selectedId = String(payload.selectedSessionId ?? '').trim();
        setSelectedLiveSessionId(selectedId);
        setLiveSwitchNote(String(payload.switchNote ?? '').trim());
        return;
      }
      if (payload.type === 'browser_catalog') {
        const sessions = Array.isArray(payload.sessions)
          ? payload.sessions
            .map((entry) => ({
              id: String(entry?.id ?? '').trim(),
              name: String(entry?.name ?? '').trim(),
            }))
            .filter((entry) => entry.id.length > 0)
          : [];
        setLiveBrowserSessions(sessions);
        const selectedId = String(payload.selectedSessionId ?? payload.selectedBrowserSessionId ?? '').trim();
        setSelectedBrowserSessionId(selectedId);
        setBrowserStatusLine(String(payload.status ?? '').trim());
        setInspectSelectionLine(String(payload.inspectSelection ?? '').trim());
      }
    } catch {
      // ignore malformed webview events
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>{copy.appTitle}</Text>
              <Text style={styles.subtitle}>{copy.appSubtitle}</Text>
            </View>
            <Pressable
              style={styles.languageButton}
              onPress={() => setLanguage((prev) => (prev === 'en' ? 'tr' : 'en'))}
            >
              <Text style={styles.languageButtonText}>{copy.languageButton}</Text>
            </Pressable>
          </View>
          <View style={[styles.statusPill, { borderColor: statusColor(connectionState) }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(connectionState) }]} />
            <Text style={[styles.statusText, { color: statusColor(connectionState) }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>{copy.pairingLinkLabel}</Text>
          <TextInput
            value={pairingLink}
            onChangeText={setPairingLink}
            placeholder={copy.pairingLinkPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>{copy.otpLabel}</Text>
          <TextInput
            value={otpCode}
            onChangeText={setOtpCode}
            placeholder={copy.otpPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
          />

          <View style={styles.primaryActions}>
            <Pressable style={[styles.connectButton, styles.flexAction]} disabled={busy} onPress={onConnect}>
              {busy ? (
                <View style={styles.connectBusyWrap}>
                  <ActivityIndicator color={palette.bg} />
                  <Text style={styles.connectButtonText}>{copy.connectInProgress}</Text>
                </View>
              ) : (
                <Text style={styles.connectButtonText}>{copy.connectButton}</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.secondaryAction, styles.flexAction]}
              onPress={() => {
                if (liveControlVisible) {
                  setLiveControlVisible(false);
                } else {
                  void openLiveControl(pairingLink);
                }
              }}
            >
              <Text style={styles.secondaryActionText}>
                {liveControlVisible ? copy.hideLiveControl : copy.openLiveControl}
              </Text>
            </Pressable>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRail}
        >
          {TAB_ORDER.map((tab) => {
            const active = tab === activeTab;
            return (
              <Pressable
                key={tab}
                style={[styles.tabButton, active ? styles.tabButtonActive : null]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabButtonText, active ? styles.tabButtonTextActive : null]}>
                  {copy.tabs[tab]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{copy.sectionTitle[activeTab]}</Text>
          <Text style={styles.sectionCopy}>{copy.sectionCopy[activeTab]}</Text>

          {activeTab === 'sessions' ? (
            <View style={styles.liveActionBlock}>
              <Text style={styles.liveFieldLabel}>{copy.liveSessionLabel}</Text>
              {liveSessions.length > 0 ? (
                <View style={styles.sessionChipWrap}>
                  {liveSessions.map((session) => {
                    const active = session.id === selectedLiveSessionId;
                    return (
                      <Pressable
                        key={session.id}
                        style={[styles.sessionChip, active ? styles.sessionChipActive : null]}
                        onPress={() => setSelectedLiveSessionId(session.id)}
                      >
                        <Text style={[styles.sessionChipText, active ? styles.sessionChipTextActive : null]}>
                          {session.name || session.id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.inlineHint}>{copy.liveSessionEmpty}</Text>
              )}
              <Pressable
                style={styles.actionButton}
                onPress={() => switchLiveSession(selectedLiveSessionId)}
                disabled={selectedLiveSessionId.trim().length === 0}
              >
                <Text style={styles.actionButtonText}>{copy.switchSessionButton}</Text>
              </Pressable>
              <Text style={styles.inlineHint}>{liveSwitchNote || copy.switchSessionHint}</Text>
            </View>
          ) : null}

          {activeTab === 'cli' ? (
            <View style={styles.liveActionBlock}>
              <Text style={styles.liveFieldLabel}>{copy.commandLabel}</Text>
              <TextInput
                value={commandDraft}
                onChangeText={setCommandDraft}
                placeholder={copy.commandPlaceholder}
                placeholderTextColor={palette.textMuted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.actionButton} onPress={sendCommandToLiveSession}>
                <Text style={styles.actionButtonText}>{copy.sendCommandButton}</Text>
              </Pressable>
              <Text style={styles.liveFieldLabel}>{copy.quickControlsLabel}</Text>
              <View style={styles.quickControlRow}>
                <Pressable style={styles.quickControlButton} onPress={() => triggerQuickControl('ctrl-c')}>
                  <Text style={styles.quickControlButtonText}>{copy.quickControlCtrlC}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => triggerQuickControl('ctrl-l')}>
                  <Text style={styles.quickControlButtonText}>{copy.quickControlCtrlL}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => triggerQuickControl('enter')}>
                  <Text style={styles.quickControlButtonText}>{copy.quickControlEnter}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => triggerQuickControl('tab')}>
                  <Text style={styles.quickControlButtonText}>{copy.quickControlTab}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {activeTab === 'browser' ? (
            <View style={styles.liveActionBlock}>
              <Text style={styles.liveFieldLabel}>{copy.browserSessionLabel}</Text>
              {liveBrowserSessions.length > 0 ? (
                <View style={styles.sessionChipWrap}>
                  {liveBrowserSessions.map((session) => {
                    const active = session.id === selectedBrowserSessionId;
                    return (
                      <Pressable
                        key={session.id}
                        style={[styles.sessionChip, active ? styles.sessionChipActive : null]}
                        onPress={() => switchBrowserSession(session.id)}
                      >
                        <Text style={[styles.sessionChipText, active ? styles.sessionChipTextActive : null]}>
                          {session.name || session.id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.inlineHint}>{copy.liveSessionEmpty}</Text>
              )}
              <Text style={styles.inlineHint}>{browserStatusLine || copy.browserStatusWaiting}</Text>
              <Text style={styles.liveFieldLabel}>{copy.inspectSelectionLabel}</Text>
              <Text style={styles.inlineHint}>{inspectSelectionLine || copy.inspectSelectionNone}</Text>
              <View style={styles.quickControlRow}>
                <Pressable style={styles.quickControlButton} onPress={() => sendBrowserControl('back')}>
                  <Text style={styles.quickControlButtonText}>{copy.browserBackButton}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => sendBrowserControl('forward')}>
                  <Text style={styles.quickControlButtonText}>{copy.browserForwardButton}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => sendBrowserControl('reload')}>
                  <Text style={styles.quickControlButtonText}>{copy.browserReloadButton}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => sendBrowserControl('toggle-inspect')}>
                  <Text style={styles.quickControlButtonText}>{copy.browserInspectButton}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => sendBrowserViewport('Responsive')}>
                  <Text style={styles.quickControlButtonText}>{copy.browserResponsiveButton}</Text>
                </Pressable>
                <Pressable style={styles.quickControlButton} onPress={() => sendBrowserViewport('iPhone 14')}>
                  <Text style={styles.quickControlButtonText}>{copy.browserPhoneButton}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {activeTab === 'inspect' ? (
            <View style={styles.liveActionBlock}>
              <Text style={styles.inlineHint}>{copy.inspectPhaseHint}</Text>
              <Pressable style={styles.actionButton} onPress={() => sendBrowserControl('toggle-inspect')}>
                <Text style={styles.actionButtonText}>{copy.browserInspectButton}</Text>
              </Pressable>
              <Text style={styles.liveFieldLabel}>{copy.inspectSelectionLabel}</Text>
              <Text style={styles.inlineHint}>{inspectSelectionLine || copy.inspectSelectionNone}</Text>
              <Text style={styles.liveFieldLabel}>{copy.inspectInstructionLabel}</Text>
              <TextInput
                value={inspectInstructionDraft}
                onChangeText={setInspectInstructionDraft}
                placeholder={copy.inspectInstructionPlaceholder}
                placeholderTextColor={palette.textMuted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.actionButton} onPress={sendInspectPrompt}>
                <Text style={styles.actionButtonText}>{copy.inspectSendButton}</Text>
              </Pressable>
              <Text style={styles.inlineHint}>{browserStatusLine || copy.browserStatusWaiting}</Text>
            </View>
          ) : null}

          {activeTab === 'live' && liveControlVisible && liveControlUrl ? (
            <View style={styles.liveWrap}>
              <View style={styles.liveStatusGrid}>
                <View style={styles.liveStatusItem}>
                  <Text style={styles.liveStatusLabel}>{copy.liveStatusLabel}</Text>
                  <Text style={styles.liveStatusValue}>
                    {liveConsoleStatus || copy.liveConsoleWaiting}
                  </Text>
                </View>
                <View style={styles.liveStatusItem}>
                  <Text style={styles.liveStatusLabel}>{copy.liveConnectionLabel}</Text>
                  <Text style={styles.liveStatusValue}>
                    {liveConnectionStatus || copy.liveConnectionWaiting}
                  </Text>
                </View>
              </View>

              <View style={styles.webviewShell}>
                <WebView
                  ref={liveWebViewRef}
                  source={{ uri: liveControlUrl }}
                  style={styles.webview}
                  onMessage={onWebViewMessage}
                  injectedJavaScriptBeforeContentLoaded={bootstrapInjection}
                  injectedJavaScript={WEBVIEW_STATUS_BRIDGE}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  domStorageEnabled
                  onLoadStart={() => setConnectionState('waiting')}
                  onError={() => {
                    setConnectionState('error');
                    setMessage(
                      language === 'tr'
                        ? 'Canli kontrol sayfasi yuklenemedi. Linki ve masaustu koprusunu kontrol edin.'
                        : 'Failed to load live control page. Check pairing link and desktop bridge.',
                    );
                  }}
                />
              </View>
            </View>
          ) : activeTab === 'live' ? (
            <Text style={styles.inlineHint}>
              {language === 'tr'
                ? 'Canli sekmede kontrol gormek icin "Canli Kontrolu Ac" butonunu kullanin.'
                : 'Use "Open Live Control" to load the realtime control surface in Live tab.'}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  languageButton: {
    minWidth: 46,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.panelElevated,
  },
  languageButtonText: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: spacing.xs,
    backgroundColor: 'rgba(7, 11, 20, 0.7)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: spacing.lg,
  },
  label: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.panelElevated,
    color: palette.text,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  primaryActions: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flexAction: {
    flex: 1,
  },
  connectButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  connectButtonText: {
    color: palette.bg,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryAction: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryActionText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  connectBusyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  message: {
    marginTop: spacing.md,
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  tabRail: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tabButton: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    justifyContent: 'center',
  },
  tabButtonActive: {
    borderColor: palette.accent,
    backgroundColor: '#1b2b47',
  },
  tabButtonText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: palette.text,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sectionCopy: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  liveActionBlock: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  liveFieldLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  inlineHint: {
    marginTop: spacing.sm,
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sessionChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sessionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  sessionChipActive: {
    borderColor: palette.accent,
    backgroundColor: '#1b2b47',
  },
  sessionChipText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sessionChipTextActive: {
    color: palette.text,
  },
  actionButton: {
    marginTop: spacing.xs,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionButtonText: {
    color: palette.bg,
    fontSize: 13,
    fontWeight: '700',
  },
  quickControlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickControlButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelElevated,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickControlButtonText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  liveWrap: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  liveStatusGrid: {
    gap: spacing.sm,
  },
  liveStatusItem: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.panelElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  liveStatusLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  liveStatusValue: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  webviewShell: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#060b14',
    minHeight: 560,
  },
  webview: {
    minHeight: 560,
    backgroundColor: '#060b14',
  },
});
