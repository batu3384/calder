import { useRef, useState } from 'react';
import type { WebViewRef } from 'react-native-webview';
import { COPY } from './copy';
import { buildNativeBootstrapInjection } from './live-bridge';
import {
  createLiveActionHandlers,
  createLiveWebViewErrorHandler,
  openLiveControlWithValidation,
  runInLiveWebView,
} from './use-mobile-controller-live-actions';
import {
  createConnectHandler,
  createWebViewMessageHandler,
} from './use-mobile-controller-session-bridge';
import type { ConnectionState, LiveSessionItem, MobileTab, UiLanguage } from './types';

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
  const statusText =
    connectionState === 'connected'
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
    return openLiveControlWithValidation({
      input: urlFromInput ?? pairingLink,
      language,
      setConnectionState,
      setMessage,
      setLiveControlUrl,
      setLiveControlVisible,
      setActiveTab,
    });
  };

  const toggleLiveControl = (): void => {
    if (liveControlVisible) {
      setLiveControlVisible(false);
      return;
    }
    void openLiveControl(pairingLink);
  };

  const runScript = (script: string): boolean => {
    return runInLiveWebView({ liveWebViewRef, liveControlVisible }, script);
  };

  const {
    switchLiveSession,
    sendCommandToLiveSession,
    triggerQuickControl,
    switchBrowserSession,
    sendBrowserControl,
    sendBrowserViewport,
    sendInspectPrompt,
  } = createLiveActionHandlers({
    language,
    setMessage,
    runScript,
    getCommandDraft: () => commandDraft,
    setCommandDraft,
    getInspectInstructionDraft: () => inspectInstructionDraft,
    setInspectInstructionDraft,
    setSelectedLiveSessionId,
    setSelectedBrowserSessionId,
  });

  const onConnect = createConnectHandler({
    pairingLink,
    otpCode,
    language,
    setBusy,
    setConnectionState,
    setMessage,
    setBootstrapPayload,
    openLiveControl,
  });

  const onWebViewMessage = createWebViewMessageHandler({
    setLiveConsoleStatus,
    setLiveConnectionStatus,
    setConnectionState,
    setLiveSessions,
    setSelectedLiveSessionId,
    setLiveSwitchNote,
    setLiveBrowserSessions,
    setSelectedBrowserSessionId,
    setBrowserStatusLine,
    setInspectSelectionLine,
  });

  const handleLiveWebViewLoadStart = (): void => {
    setConnectionState('waiting');
  };

  const handleLiveWebViewError = createLiveWebViewErrorHandler({
    language,
    setConnectionState,
    setMessage,
  });

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
