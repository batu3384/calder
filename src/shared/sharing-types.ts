// P2P session sharing type definitions.

export type ShareMode = 'readonly' | 'readwrite';

export interface ShareIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ShareRtcConfig {
  iceServers: ShareIceServer[];
  iceTransportPolicy?: 'all' | 'relay';
  source?: 'default' | 'env';
  issues?: string[];
}

export type ShareBrowserControlAction =
  | 'back'
  | 'forward'
  | 'reload'
  | 'toggle-inspect'
  | 'set-viewport';

// Protocol messages sent over the WebRTC data channel.
export type ShareMessage =
  | { type: 'init'; scrollback: string; mode: ShareMode; cols: number; rows: number; sessionName: string }
  | { type: 'session-catalog'; activeSessionId: string; sessions: Array<{ id: string; name: string }> }
  | {
      type: 'session-switch-result';
      ok: boolean;
      sessionId?: string;
      sessionName?: string;
      scrollback?: string;
      cols?: number;
      rows?: number;
      reason?: string;
    }
  | { type: 'data'; payload: string }
  | { type: 'input'; payload: string }
  | { type: 'session-switch'; sessionId: string }
  | { type: 'browser-state-request' }
  | { type: 'browser-control'; action: ShareBrowserControlAction; sessionId?: string; viewportLabel?: string }
  | {
      type: 'browser-state';
      activeBrowserSessionId: string;
      sessions: Array<{
        id: string;
        name: string;
        url: string;
        inspectMode: boolean;
        canGoBack: boolean;
        canGoForward: boolean;
        viewportLabel: string;
        selectedElementSummary?: string;
      }>;
    }
  | {
      type: 'browser-control-result';
      ok: boolean;
      action: ShareBrowserControlAction;
      sessionId?: string;
      reason?: string;
    }
  | { type: 'browser-inspect-submit'; sessionId?: string; instruction: string }
  | { type: 'browser-inspect-result'; ok: boolean; sessionId?: string; reason?: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'end' }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'auth-challenge'; challenge: string }
  | { type: 'auth-response'; response: string }
  | { type: 'auth-result'; ok: boolean; reason?: string };
