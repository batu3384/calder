import type { Dispatch, SetStateAction } from 'react';
import type { WebViewMessageEvent } from 'react-native-webview';
import { bootstrapPairing } from '../services/pairing';
import { inferConnectionStateFromText } from './live-bridge';
import type { ConnectionState, LiveBridgeMessage, LiveSessionItem, UiLanguage } from './types';

type StringSetter = Dispatch<SetStateAction<string>>;
type ConnectionSetter = Dispatch<SetStateAction<ConnectionState>>;

function mapSessionCatalog(entries: unknown): LiveSessionItem[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const session = entry as { id?: unknown; name?: unknown };
      return {
        id: String(session.id ?? '').trim(),
        name: String(session.name ?? '').trim(),
      };
    })
    .filter((entry) => entry.id.length > 0);
}

function localizedMessage(language: UiLanguage, tr: string, en: string): string {
  return language === 'tr' ? tr : en;
}

type ConnectHandlerDeps = {
  pairingLink: string;
  otpCode: string;
  language: UiLanguage;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setConnectionState: ConnectionSetter;
  setMessage: StringSetter;
  setBootstrapPayload: Dispatch<SetStateAction<unknown>>;
  openLiveControl: (urlFromInput?: string | null) => boolean;
};

export function createConnectHandler({
  pairingLink,
  otpCode,
  language,
  setBusy,
  setConnectionState,
  setMessage,
  setBootstrapPayload,
  openLiveControl,
}: ConnectHandlerDeps): () => Promise<void> {
  return async () => {
    setBusy(true);
    setConnectionState('waiting');
    setMessage('');

    const result = await bootstrapPairing(pairingLink, otpCode);
    if (result.ok) {
      setConnectionState('connected');
      setBootstrapPayload(result.response);
      const opened = openLiveControl(pairingLink);
      setMessage(
        opened
          ? localizedMessage(
              language,
              'Bootstrap basarili. Canli kontrol ekrani acildi.',
              'Bootstrap succeeded. Live control view opened.',
            )
          : localizedMessage(
              language,
              'Bootstrap basarili. Simdi gecerli pairing link ile canli kontrolu acabilirsiniz.',
              'Bootstrap succeeded. You can now open live control with a valid pairing link.',
            ),
      );
    } else {
      setConnectionState('error');
      setMessage(result.error);
    }
    setBusy(false);
  };
}

type WebViewMessageHandlerDeps = {
  setLiveConsoleStatus: StringSetter;
  setLiveConnectionStatus: StringSetter;
  setConnectionState: ConnectionSetter;
  setLiveSessions: Dispatch<SetStateAction<LiveSessionItem[]>>;
  setSelectedLiveSessionId: StringSetter;
  setLiveSwitchNote: StringSetter;
  setLiveBrowserSessions: Dispatch<SetStateAction<LiveSessionItem[]>>;
  setSelectedBrowserSessionId: StringSetter;
  setBrowserStatusLine: StringSetter;
  setInspectSelectionLine: StringSetter;
};

export function createWebViewMessageHandler({
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
}: WebViewMessageHandlerDeps): (event: WebViewMessageEvent) => void {
  return (event) => {
    const raw = event.nativeEvent.data;
    try {
      const payload = JSON.parse(raw) as LiveBridgeMessage;
      if (payload.type === 'mobile_status') {
        const nextConsole = String(payload.status ?? '').trim();
        const nextConn = String(payload.conn ?? '').trim();
        setLiveConsoleStatus(nextConsole);
        setLiveConnectionStatus(nextConn);
        setConnectionState(inferConnectionStateFromText(`${nextConsole} ${nextConn}`));
        return;
      }
      if (payload.type === 'session_catalog') {
        setLiveSessions(mapSessionCatalog(payload.sessions));
        setSelectedLiveSessionId(String(payload.selectedSessionId ?? '').trim());
        setLiveSwitchNote(String(payload.switchNote ?? '').trim());
        return;
      }
      if (payload.type === 'browser_catalog') {
        setLiveBrowserSessions(mapSessionCatalog(payload.sessions));
        setSelectedBrowserSessionId(
          String(payload.selectedSessionId ?? payload.selectedBrowserSessionId ?? '').trim(),
        );
        setBrowserStatusLine(String(payload.status ?? '').trim());
        setInspectSelectionLine(String(payload.inspectSelection ?? '').trim());
      }
    } catch {
      // Ignore malformed webview events from external content.
    }
  };
}
