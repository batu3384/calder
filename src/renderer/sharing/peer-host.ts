// Host-side WebRTC logic for P2P session sharing.
// Uses native RTCPeerConnection (available in Electron's Chromium).

import type { ShareMode, ShareMessage } from '../../shared/sharing-types.js';
import type { SessionRecord, ShareRtcConfig } from '../../shared/types.js';
import { getTerminalInstance } from '../components/terminal-pane.js';
import { SerializeAddon } from '@xterm/addon-serialize';
import { buildRtcConfiguration, sendMessage, waitForIceGathering, encodeConnectionCode, decodeConnectionCode } from './webrtc-utils.js';
import { generateChallenge, computeChallengeResponse, bytesToHex } from './share-crypto.js';
import { appState } from '../state.js';

interface HostPeer {
  ownerSessionId: string;
  activeSessionId: string;
  mode: ShareMode;
  passphrase: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  connected: boolean;
  authState: 'none' | 'pending' | 'verified';
  authChallenge: Uint8Array | null;
  authTimeout: ReturnType<typeof setTimeout> | null;
  keepaliveTimer: ReturnType<typeof setInterval> | null;
  missedPongs: number;
  serializeAddon: SerializeAddon;
}

const hostPeers = new Map<string, HostPeer>();

const KEEPALIVE_INTERVAL = 30_000;
const MAX_MISSED_PONGS = 3;
const CHUNK_SIZE = 64 * 1024;
const AUTH_TIMEOUT = 10_000;

type EventCallback = () => void;

interface SessionSnapshot {
  sessionId: string;
  sessionName: string;
  scrollback: string;
  cols: number;
  rows: number;
}

function isShareableCliSession(session: SessionRecord): boolean {
  return !session.type || session.type === 'claude';
}

function findProjectForShare(ownerSessionId: string) {
  return appState.projects.find((project) => project.sessions.some((session) => session.id === ownerSessionId));
}

function getSessionSnapshot(hostPeer: HostPeer, sessionId: string): SessionSnapshot | null {
  const instance = getTerminalInstance(sessionId);
  if (!instance) return null;

  let scrollback = '';
  if (sessionId === hostPeer.ownerSessionId) {
    scrollback = hostPeer.serializeAddon.serialize();
  } else {
    const addon = new SerializeAddon();
    instance.terminal.loadAddon(addon);
    scrollback = addon.serialize();
    addon.dispose();
  }

  return {
    sessionId,
    sessionName: instance.sessionId,
    scrollback,
    cols: instance.terminal.cols,
    rows: instance.terminal.rows,
  };
}

function buildSessionCatalog(hostPeer: HostPeer): { activeSessionId: string; sessions: Array<{ id: string; name: string }> } {
  const project = findProjectForShare(hostPeer.ownerSessionId);
  if (!project) {
    const fallback = getSessionSnapshot(hostPeer, hostPeer.activeSessionId);
    if (!fallback) {
      return { activeSessionId: hostPeer.activeSessionId, sessions: [] };
    }
    return {
      activeSessionId: fallback.sessionId,
      sessions: [{ id: fallback.sessionId, name: fallback.sessionName }],
    };
  }

  const sessions = project.sessions
    .filter((session) => isShareableCliSession(session))
    .filter((session) => Boolean(getTerminalInstance(session.id)))
    .map((session) => ({ id: session.id, name: session.name }));

  if (!sessions.some((session) => session.id === hostPeer.activeSessionId) && sessions.length > 0) {
    hostPeer.activeSessionId = sessions[0].id;
  }

  return {
    activeSessionId: hostPeer.activeSessionId,
    sessions,
  };
}

export interface ShareHandle {
  getOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  stop(): void;
  onConnected(cb: EventCallback): void;
  onDisconnected(cb: EventCallback): void;
  onAuthFailed(cb: (reason: string) => void): void;
}

export function startShare(
  sessionId: string,
  mode: ShareMode,
  passphrase: string,
  rtcConfig?: ShareRtcConfig,
): ShareHandle {
  stopShare(sessionId);

  const instance = getTerminalInstance(sessionId);
  if (!instance) throw new Error(`No terminal instance for session ${sessionId}`);
  const terminalInstance = instance;

  const serializeAddon = new SerializeAddon();
  terminalInstance.terminal.loadAddon(serializeAddon);

  const connectedCbs: EventCallback[] = [];
  const disconnectedCbs: EventCallback[] = [];
  const authFailedCbs: ((reason: string) => void)[] = [];
  let disconnectFired = false;

  const pc = new RTCPeerConnection(buildRtcConfiguration(rtcConfig));
  const dc = pc.createDataChannel('terminal', { ordered: true });

  const hostPeer: HostPeer = {
    ownerSessionId: sessionId,
    activeSessionId: sessionId,
    mode,
    passphrase,
    pc,
    dc,
    connected: false,
    authState: 'none',
    authChallenge: null,
    authTimeout: null,
    keepaliveTimer: null,
    missedPongs: 0,
    serializeAddon,
  };

  hostPeers.set(sessionId, hostPeer);

  function sendInitAndStartKeepalive(): void {
    const snapshot = getSessionSnapshot(hostPeer, hostPeer.activeSessionId);
    if (!snapshot) return;

    const initMsg: ShareMessage = {
      type: 'init',
      scrollback: '',
      mode,
      cols: snapshot.cols,
      rows: snapshot.rows,
      sessionName: snapshot.sessionName,
    };

    if (snapshot.scrollback.length > CHUNK_SIZE) {
      sendMessage(dc, initMsg);
      for (let i = 0; i < snapshot.scrollback.length; i += CHUNK_SIZE) {
        sendMessage(dc, { type: 'data', payload: snapshot.scrollback.slice(i, i + CHUNK_SIZE) });
      }
    } else {
      initMsg.scrollback = snapshot.scrollback;
      sendMessage(dc, initMsg);
    }

    sendMessage(dc, { type: 'session-catalog', ...buildSessionCatalog(hostPeer) });

    hostPeer.keepaliveTimer = setInterval(() => {
      if (!hostPeer.connected) return;
      hostPeer.missedPongs++;
      if (hostPeer.missedPongs > MAX_MISSED_PONGS) {
        stopShare(sessionId);
        return;
      }
      sendMessage(dc, { type: 'ping' });
    }, KEEPALIVE_INTERVAL);

    for (const cb of connectedCbs) cb();
  }

  dc.onopen = () => {
    hostPeer.connected = true;

    // Start auth handshake — do not send session data until verified
    const challenge = generateChallenge();
    hostPeer.authChallenge = challenge;
    hostPeer.authState = 'pending';
    sendMessage(dc, { type: 'auth-challenge', challenge: bytesToHex(challenge) });

    hostPeer.authTimeout = setTimeout(() => {
      if (hostPeer.authState !== 'verified') {
        for (const cb of authFailedCbs) cb('Authentication timed out');
        stopShare(sessionId);
      }
    }, AUTH_TIMEOUT);
  };

  dc.onmessage = (event: MessageEvent) => {
    let msg: ShareMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // Auth handshake
    if (hostPeer.authState === 'pending' && msg.type === 'auth-response') {
      computeChallengeResponse(hostPeer.authChallenge!, passphrase).then((expected) => {
        if (hostPeer.authTimeout) {
          clearTimeout(hostPeer.authTimeout);
          hostPeer.authTimeout = null;
        }
        if (expected === msg.response) {
          hostPeer.authState = 'verified';
          sendMessage(dc, { type: 'auth-result', ok: true });
          sendInitAndStartKeepalive();
        } else {
          sendMessage(dc, { type: 'auth-result', ok: false, reason: 'Passphrase mismatch' });
          for (const cb of authFailedCbs) cb('Passphrase mismatch');
          stopShare(sessionId);
        }
      });
      return;
    }

    // Ignore all non-auth messages until verified
    if (hostPeer.authState !== 'verified') return;

    if (msg.type === 'session-switch') {
      const catalog = buildSessionCatalog(hostPeer);
      const exists = catalog.sessions.some((session) => session.id === msg.sessionId);
      if (!exists) {
        sendMessage(dc, { type: 'session-switch-result', ok: false, reason: 'Session not available.' });
        return;
      }

      const snapshot = getSessionSnapshot(hostPeer, msg.sessionId);
      if (!snapshot) {
        sendMessage(dc, { type: 'session-switch-result', ok: false, reason: 'Session terminal is not available.' });
        return;
      }

      hostPeer.activeSessionId = msg.sessionId;
      const project = findProjectForShare(hostPeer.ownerSessionId);
      if (project) {
        appState.setActiveSession(project.id, msg.sessionId);
      }

      sendMessage(dc, {
        type: 'session-switch-result',
        ok: true,
        sessionId: snapshot.sessionId,
        sessionName: snapshot.sessionName,
        scrollback: snapshot.scrollback,
        cols: snapshot.cols,
        rows: snapshot.rows,
      });
      sendMessage(dc, { type: 'session-catalog', ...buildSessionCatalog(hostPeer) });
      return;
    }

    if (msg.type === 'input' && mode === 'readwrite') {
      window.calder.pty.write(hostPeer.activeSessionId, msg.payload);
    } else if (msg.type === 'pong') {
      hostPeer.missedPongs = 0;
    }
  };

  const handleDisconnect = () => {
    if (disconnectFired) return;
    disconnectFired = true;
    hostPeer.connected = false;
    cleanup(sessionId);
    for (const cb of disconnectedCbs) cb();
  };

  dc.onclose = handleDisconnect;

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      handleDisconnect();
    }
  };

  return {
    async getOffer(): Promise<string> {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      return encodeConnectionCode(pc.localDescription, passphrase, rtcConfig);
    },
    async acceptAnswer(answer: string): Promise<void> {
      const desc = await decodeConnectionCode(answer, 'answer', passphrase);
      await pc.setRemoteDescription(new RTCSessionDescription(desc));
    },
    stop(): void {
      stopShare(sessionId);
    },
    onConnected(cb: EventCallback): void {
      connectedCbs.push(cb);
    },
    onDisconnected(cb: EventCallback): void {
      disconnectedCbs.push(cb);
    },
    onAuthFailed(cb: (reason: string) => void): void {
      authFailedCbs.push(cb);
    },
  };
}

export function stopShare(sessionId: string): void {
  const hostPeer = hostPeers.get(sessionId);
  if (!hostPeer) return;

  if (hostPeer.connected) {
    try { sendMessage(hostPeer.dc, { type: 'end' }); } catch { /* ignore */ }
  }
  cleanup(sessionId);
  hostPeer.dc.close();
  hostPeer.pc.close();
}

export function broadcastData(sessionId: string, data: string): void {
  for (const hostPeer of hostPeers.values()) {
    if (!hostPeer.connected) continue;
    if (hostPeer.activeSessionId !== sessionId) continue;
    sendMessage(hostPeer.dc, { type: 'data', payload: data });
  }
}

export function broadcastResize(sessionId: string, cols: number, rows: number): void {
  for (const hostPeer of hostPeers.values()) {
    if (!hostPeer.connected) continue;
    if (hostPeer.activeSessionId !== sessionId) continue;
    sendMessage(hostPeer.dc, { type: 'resize', cols, rows });
  }
}

export function isSharing(sessionId: string): boolean {
  for (const hostPeer of hostPeers.values()) {
    if (hostPeer.ownerSessionId === sessionId || hostPeer.activeSessionId === sessionId) {
      return true;
    }
  }
  return false;
}

export function isConnected(sessionId: string): boolean {
  return hostPeers.get(sessionId)?.connected ?? false;
}

function cleanup(sessionId: string): void {
  const hostPeer = hostPeers.get(sessionId);
  if (!hostPeer) return;
  if (hostPeer.keepaliveTimer) {
    clearInterval(hostPeer.keepaliveTimer);
    hostPeer.keepaliveTimer = null;
  }
  if (hostPeer.authTimeout) {
    clearTimeout(hostPeer.authTimeout);
    hostPeer.authTimeout = null;
  }
  hostPeer.serializeAddon.dispose();
  hostPeers.delete(sessionId);
}
