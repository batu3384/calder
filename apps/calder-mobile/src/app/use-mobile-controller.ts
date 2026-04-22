import { useRef, useState } from 'react';
import type { WebViewMessageEvent, WebViewRef } from 'react-native-webview';
import { bootstrapPairing, normalizePairingUrl } from '../services/pairing';
import { COPY } from './copy';
import { buildNativeBootstrapInjection, inferConnectionStateFromText } from './live-bridge';
import type {
  BrowserControlAction,
  BrowserViewportLabel,
  ConnectionState,
  LiveBridgeMessage,
  LiveSessionItem,
  MobileTab,
  QuickControl,
  UiLanguage,
} from './types';

function localizedMessage(language: UiLanguage, tr: string, en: string): string {
  return language === 'tr' ? tr : en;
}

export function useMobileController() {
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

  const bootstrapInjection = buildNativeBootstrapInjection(liveControlUrl, bootstrapPayload);

  const toggleLanguage = (): void => {
    setLanguage((prev) => (prev === 'en' ? 'tr' : 'en'));
  };

  const openLiveControl = (urlFromInput?: string | null): boolean => {
    const normalized = normalizePairingUrl(urlFromInput ?? pairingLink);
    if (!normalized) {
      setConnectionState('error');
      setMessage(
        localizedMessage(
          language,
          'Canli kontrol icin gecerli bir pairing link girin.',
          'Enter a valid pairing link to open live control.',
        ),
      );
      return false;
    }
    setLiveControlUrl(normalized);
    setLiveControlVisible(true);
    setActiveTab('live');
    return true;
  };

  const toggleLiveControl = (): void => {
    if (liveControlVisible) {
      setLiveControlVisible(false);
      return;
    }
    void openLiveControl(pairingLink);
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
        localizedMessage(
          language,
          'Canli kanal acik degil. Once Canli kontrolu acin.',
          'Live channel is not open yet. Open Live control first.',
        ),
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
        localizedMessage(
          language,
          'Komut gonderilemedi. Canli kontrol baglantisini kontrol edin.',
          'Command could not be sent. Check live control connectivity.',
        ),
      );
      return;
    }
    setCommandDraft('');
  };

  const triggerQuickControl = (control: QuickControl): void => {
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
        localizedMessage(
          language,
          'Hizli kontrol gonderilemedi. Canli kanal aktif degil.',
          'Quick control could not be sent. Live channel is not active.',
        ),
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
        localizedMessage(
          language,
          'Tarayici oturumu degistirilemedi. Once canli kontrolu acin.',
          'Browser session could not be switched. Open Live control first.',
        ),
      );
      return;
    }
    setSelectedBrowserSessionId(normalized);
  };

  const sendBrowserControl = (action: BrowserControlAction): void => {
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
        localizedMessage(
          language,
          'Tarayici aksiyonu gonderilemedi. Canli kanal aktif degil.',
          'Browser action could not be sent. Live channel is not active.',
        ),
      );
    }
  };

  const sendBrowserViewport = (label: BrowserViewportLabel): void => {
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
        localizedMessage(
          language,
          'Viewport aksiyonu gonderilemedi. Canli kanal aktif degil.',
          'Viewport action could not be sent. Live channel is not active.',
        ),
      );
    }
  };

  const sendInspectPrompt = (): void => {
    const instruction = inspectInstructionDraft.trim();
    if (!instruction) {
      setMessage(
        localizedMessage(
          language,
          'Inspect talimati bos olamaz.',
          'Inspect instruction cannot be empty.',
        ),
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
        localizedMessage(
          language,
          'Inspect prompt gonderilemedi. Canli kanal aktif degil.',
          'Inspect prompt could not be sent. Live channel is not active.',
        ),
      );
      return;
    }
    setInspectInstructionDraft('');
  };

  const onConnect = async (): Promise<void> => {
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
          localizedMessage(
            language,
            'Bootstrap basarili. Canli kontrol ekrani acildi.',
            'Bootstrap succeeded. Live control view opened.',
          ),
        );
      } else {
        setMessage(
          localizedMessage(
            language,
            'Bootstrap basarili. Simdi gecerli pairing link ile canli kontrolu acabilirsiniz.',
            'Bootstrap succeeded. You can now open live control with a valid pairing link.',
          ),
        );
      }
    } else {
      setConnectionState('error');
      setMessage(result.error);
    }
    setBusy(false);
  };

  const onWebViewMessage = (event: WebViewMessageEvent): void => {
    const raw = event.nativeEvent.data;
    try {
      const payload = JSON.parse(raw) as LiveBridgeMessage;
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
      // Ignore malformed webview events from external content.
    }
  };

  const handleLiveWebViewLoadStart = (): void => {
    setConnectionState('waiting');
  };

  const handleLiveWebViewError = (): void => {
    setConnectionState('error');
    setMessage(
      localizedMessage(
        language,
        'Canli kontrol sayfasi yuklenemedi. Linki ve masaustu koprusunu kontrol edin.',
        'Failed to load live control page. Check pairing link and desktop bridge.',
      ),
    );
  };

  return {
    liveWebViewRef,
    language,
    activeTab,
    pairingLink,
    otpCode,
    message,
    busy,
    connectionState,
    liveControlUrl,
    liveControlVisible,
    liveConsoleStatus,
    liveConnectionStatus,
    liveSessions,
    selectedLiveSessionId,
    liveSwitchNote,
    liveBrowserSessions,
    selectedBrowserSessionId,
    browserStatusLine,
    inspectSelectionLine,
    inspectInstructionDraft,
    commandDraft,
    copy,
    statusText,
    bootstrapInjection,
    toggleLanguage,
    setActiveTab,
    setPairingLink,
    setOtpCode,
    setSelectedLiveSessionId,
    setInspectInstructionDraft,
    setCommandDraft,
    onConnect,
    toggleLiveControl,
    switchLiveSession,
    sendCommandToLiveSession,
    triggerQuickControl,
    switchBrowserSession,
    sendBrowserControl,
    sendBrowserViewport,
    sendInspectPrompt,
    onWebViewMessage,
    handleLiveWebViewLoadStart,
    handleLiveWebViewError,
  };
}

export type MobileController = ReturnType<typeof useMobileController>;
