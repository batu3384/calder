import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { WebViewRef } from 'react-native-webview';
import { normalizePairingUrl } from '../services/pairing';
import type {
  BrowserControlAction,
  BrowserViewportLabel,
  ConnectionState,
  MobileTab,
  QuickControl,
  UiLanguage,
} from './types';

type StringSetter = Dispatch<SetStateAction<string>>;

function setLocalizedMessage(
  language: UiLanguage,
  setMessage: StringSetter,
  tr: string,
  en: string,
): void {
  setMessage(language === 'tr' ? tr : en);
}

type OpenLiveControlDeps = {
  input: string;
  language: UiLanguage;
  setConnectionState: Dispatch<SetStateAction<ConnectionState>>;
  setMessage: StringSetter;
  setLiveControlUrl: Dispatch<SetStateAction<string | null>>;
  setLiveControlVisible: Dispatch<SetStateAction<boolean>>;
  setActiveTab: Dispatch<SetStateAction<MobileTab>>;
};

export function openLiveControlWithValidation({
  input,
  language,
  setConnectionState,
  setMessage,
  setLiveControlUrl,
  setLiveControlVisible,
  setActiveTab,
}: OpenLiveControlDeps): boolean {
  const normalized = normalizePairingUrl(input);
  if (!normalized) {
    setConnectionState('error');
    setLocalizedMessage(
      language,
      setMessage,
      'Canli kontrol icin gecerli bir pairing link girin.',
      'Enter a valid pairing link to open live control.',
    );
    return false;
  }
  setLiveControlUrl(normalized);
  setLiveControlVisible(true);
  setActiveTab('live');
  return true;
}

type RunInLiveWebViewDeps = {
  liveWebViewRef: MutableRefObject<WebViewRef | null>;
  liveControlVisible: boolean;
};

export function runInLiveWebView({ liveWebViewRef, liveControlVisible }: RunInLiveWebViewDeps, script: string): boolean {
  const webView = liveWebViewRef.current;
  if (!webView || !liveControlVisible) return false;
  webView.injectJavaScript(`${script}\ntrue;`);
  return true;
}

type LiveActionHandlersDeps = {
  language: UiLanguage;
  setMessage: StringSetter;
  runScript: (script: string) => boolean;
  getCommandDraft: () => string;
  setCommandDraft: StringSetter;
  getInspectInstructionDraft: () => string;
  setInspectInstructionDraft: StringSetter;
  setSelectedLiveSessionId: StringSetter;
  setSelectedBrowserSessionId: StringSetter;
};

export function createLiveActionHandlers({
  language,
  setMessage,
  runScript,
  getCommandDraft,
  setCommandDraft,
  getInspectInstructionDraft,
  setInspectInstructionDraft,
  setSelectedLiveSessionId,
  setSelectedBrowserSessionId,
}: LiveActionHandlersDeps) {
  const writeMessage = (tr: string, en: string): void => {
    setLocalizedMessage(language, setMessage, tr, en);
  };

  const switchLiveSession = (sessionId: string): void => {
    const normalized = sessionId.trim();
    if (!normalized) return;
    const payload = JSON.stringify(normalized);
    const ok = runScript(`(() => {
      const select = document.querySelector('[data-mobile-session-select]');
      const button = document.querySelector('[data-mobile-session-switch]');
      if (!(select instanceof HTMLSelectElement) || !(button instanceof HTMLElement)) return;
      select.value = ${payload};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      button.click();
    })();`);
    if (!ok) {
      writeMessage(
        'Canli kanal acik degil. Once Canli kontrolu acin.',
        'Live channel is not open yet. Open Live control first.',
      );
      return;
    }
    setSelectedLiveSessionId(normalized);
  };

  const sendCommandToLiveSession = (): void => {
    const command = getCommandDraft().trim();
    if (!command) return;
    const payload = JSON.stringify(command);
    const ok = runScript(`(() => {
      const input = document.getElementById('commandInput');
      const composer = document.getElementById('composer');
      if (!(input instanceof HTMLInputElement) || !(composer instanceof HTMLFormElement)) return;
      input.value = ${payload};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })();`);
    if (!ok) {
      writeMessage(
        'Komut gonderilemedi. Canli kontrol baglantisini kontrol edin.',
        'Command could not be sent. Check live control connectivity.',
      );
      return;
    }
    setCommandDraft('');
  };

  const triggerQuickControl = (control: QuickControl): void => {
    const payload = JSON.stringify(control);
    const ok = runScript(`(() => {
      const value = ${payload};
      const selector = '[data-control="' + value + '"]';
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    })();`);
    if (!ok) {
      writeMessage(
        'Hizli kontrol gonderilemedi. Canli kanal aktif degil.',
        'Quick control could not be sent. Live channel is not active.',
      );
    }
  };

  const switchBrowserSession = (sessionId: string): void => {
    const normalized = sessionId.trim();
    if (!normalized) return;
    const payload = JSON.stringify(normalized);
    const ok = runScript(`(() => {
      const select = document.querySelector('[data-mobile-browser-session-select]');
      if (!(select instanceof HTMLSelectElement)) return;
      select.value = ${payload};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })();`);
    if (!ok) {
      writeMessage(
        'Tarayici oturumu degistirilemedi. Once canli kontrolu acin.',
        'Browser session could not be switched. Open Live control first.',
      );
      return;
    }
    setSelectedBrowserSessionId(normalized);
  };

  const sendBrowserControl = (action: BrowserControlAction): void => {
    const payload = JSON.stringify(action);
    const ok = runScript(`(() => {
      const actionValue = ${payload};
      const selector = '[data-mobile-browser-control][data-browser-control="' + actionValue + '"]';
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    })();`);
    if (!ok) {
      writeMessage(
        'Tarayici aksiyonu gonderilemedi. Canli kanal aktif degil.',
        'Browser action could not be sent. Live channel is not active.',
      );
    }
  };

  const sendBrowserViewport = (label: BrowserViewportLabel): void => {
    const payload = JSON.stringify(label);
    const ok = runScript(`(() => {
      const viewportLabel = ${payload};
      const selector = '[data-mobile-browser-viewport][data-browser-viewport="' + viewportLabel + '"]';
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    })();`);
    if (!ok) {
      writeMessage(
        'Viewport aksiyonu gonderilemedi. Canli kanal aktif degil.',
        'Viewport action could not be sent. Live channel is not active.',
      );
    }
  };

  const sendInspectPrompt = (): void => {
    const instruction = getInspectInstructionDraft().trim();
    if (!instruction) {
      writeMessage(
        'Inspect talimati bos olamaz.',
        'Inspect instruction cannot be empty.',
      );
      return;
    }
    const payload = JSON.stringify(instruction);
    const ok = runScript(`(() => {
      const input = document.getElementById('browserInspectInput');
      const form = document.getElementById('browserInspectComposer');
      if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return;
      input.value = ${payload};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })();`);
    if (!ok) {
      writeMessage(
        'Inspect prompt gonderilemedi. Canli kanal aktif degil.',
        'Inspect prompt could not be sent. Live channel is not active.',
      );
      return;
    }
    setInspectInstructionDraft('');
  };

  return {
    switchLiveSession,
    sendCommandToLiveSession,
    triggerQuickControl,
    switchBrowserSession,
    sendBrowserControl,
    sendBrowserViewport,
    sendInspectPrompt,
  };
}

type LiveWebViewErrorHandlerDeps = {
  language: UiLanguage;
  setConnectionState: Dispatch<SetStateAction<ConnectionState>>;
  setMessage: StringSetter;
};

export function createLiveWebViewErrorHandler({
  language,
  setConnectionState,
  setMessage,
}: LiveWebViewErrorHandlerDeps): () => void {
  return () => {
    setConnectionState('error');
    setLocalizedMessage(
      language,
      setMessage,
      'Canli kontrol sayfasi yuklenemedi. Linki ve masaustu koprusunu kontrol edin.',
      'Failed to load live control page. Check pairing link and desktop bridge.',
    );
  };
}
