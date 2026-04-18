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
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'end' }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'auth-challenge'; challenge: string }
  | { type: 'auth-response'; response: string }
  | { type: 'auth-result'; ok: boolean; reason?: string };
