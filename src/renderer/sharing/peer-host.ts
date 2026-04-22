// Host-side WebRTC logic for P2P session sharing.
// Uses native RTCPeerConnection (available in Electron's Chromium).

import type { ShareBrowserControlAction, ShareMode, ShareMessage } from '../../shared/sharing-types.js';
import type { ShareRtcConfig } from '../../shared/types/project.js';
import { deliverPromptToTerminalSession, getTerminalInstance } from '../components/terminal-pane.js';
import { getBrowserTabInstance } from '../components/browser-tab/instance.js';
import { toggleInspectMode } from '../components/browser-tab/inspect-mode.js';
import { VIEWPORT_PRESETS } from '../components/browser-tab/types.js';
import { applyViewport } from '../components/browser-tab/viewport.js';
import { SerializeAddon } from '@xterm/addon-serialize';
import { buildRtcConfiguration, sendMessage, waitForIceGathering, encodeConnectionCode, decodeConnectionCode } from './webrtc-utils.js';
import { generateChallenge, computeChallengeResponse, bytesToHex } from './share-crypto.js';
import {
  buildBrowserSessionCatalog,
  buildInspectPromptFromSelection,
  buildSessionCatalog,
  findProjectForShare,
  getSessionSnapshot,
  resolveBrowserTargetSessionId,
} from './peer-host-session-catalog.js';
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
  connectedAtMs: number | null;
  verifiedAtMs: number | null;
  lastPingAtMs: number | null;
  lastPongAtMs: number | null;
  serializeAddon: SerializeAddon;
}

const hostPeers = new Map<string, HostPeer>();

const KEEPALIVE_INTERVAL = 30_000;
const MAX_MISSED_PONGS = 3;
const CHUNK_SIZE = 64 * 1024;
const AUTH_TIMEOUT = 10_000;

type EventCallback = () => void;

export interface ShareConnectionSnapshot {
  ownerSessionId: string;
  activeSessionId: string;
  mode: ShareMode;
  connected: boolean;
  authState: 'none' | 'pending' | 'verified';
  missedPongs: number;
  connectedAtMs: number | null;
  verifiedAtMs: number | null;
  lastPingAtMs: number | null;
  lastPongAtMs: number | null;
}

function sendBrowserState(hostPeer: HostPeer): void {
  if (!hostPeer.connected || hostPeer.authState !== 'verified') return;
  sendMessage(hostPeer.dc, {
    type: 'browser-state',
    ...buildBrowserSessionCatalog(hostPeer.ownerSessionId),
  });
}

function sendBrowserControlResult(
  hostPeer: HostPeer,
  action: ShareBrowserControlAction,
  ok: boolean,
  sessionId?: string,
  reason?: string,
): void {
  sendMessage(hostPeer.dc, {
    type: 'browser-control-result',
    ok,
    action,
    sessionId,
    reason,
  });
}

function sendBrowserInspectResult(hostPeer: HostPeer, ok: boolean, sessionId?: string, reason?: string): void {
  sendMessage(hostPeer.dc, {
    type: 'browser-inspect-result',
    ok,
    sessionId,
    reason,
  });
}

function handleBrowserControl(
  hostPeer: HostPeer,
  action: ShareBrowserControlAction,
  requestedSessionId?: string,
  viewportLabel?: string,
): void {
  const targetSessionId = resolveBrowserTargetSessionId(hostPeer.ownerSessionId, requestedSessionId);
  if (!targetSessionId) {
    sendBrowserControlResult(hostPeer, action, false, undefined, 'No browser session is currently available.');
    return;
  }

  const instance = getBrowserTabInstance(targetSessionId);
  if (!instance) {
    sendBrowserControlResult(hostPeer, action, false, targetSessionId, 'Browser surface is not ready.');
    return;
  }

  let ok = true;
  let reason: string | undefined;

  try {
    switch (action) {
      case 'back':
        if (!instance.webview.canGoBack()) {
          ok = false;
          reason = 'No page behind this one yet.';
          break;
        }
        instance.webview.goBack();
        break;
      case 'forward':
        if (!instance.webview.canGoForward()) {
          ok = false;
          reason = 'No forward page yet.';
          break;
        }
        instance.webview.goForward();
        break;
      case 'reload':
        instance.webview.reload();
        break;
      case 'toggle-inspect':
        toggleInspectMode(instance);
        break;
      case 'set-viewport': {
        const requestedLabel = String(viewportLabel || '').trim().toLowerCase();
        const preset = VIEWPORT_PRESETS.find((entry) => entry.label.toLowerCase() === requestedLabel);
        if (!preset) {
          ok = false;
          reason = 'Viewport preset is not recognized.';
          break;
        }
        applyViewport(instance, preset);
        break;
      }
      default:
        ok = false;
        reason = 'Browser action is not supported.';
    }
  } catch (error) {
    ok = false;
    reason = error instanceof Error ? error.message : 'Browser action failed.';
  }

  const project = findProjectForShare(hostPeer.ownerSessionId);
  if (ok && project) {
    appState.setActiveSession(project.id, targetSessionId);
  }

  sendBrowserControlResult(hostPeer, action, ok, targetSessionId, reason);
  sendBrowserState(hostPeer);
}

async function handleBrowserInspectSubmit(
  hostPeer: HostPeer,
  requestedSessionId: string | undefined,
  instruction: string,
): Promise<void> {
  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) {
    sendBrowserInspectResult(hostPeer, false, requestedSessionId, 'Inspect instruction is required.');
    sendBrowserState(hostPeer);
    return;
  }

  const targetBrowserSessionId = resolveBrowserTargetSessionId(hostPeer.ownerSessionId, requestedSessionId);
  if (!targetBrowserSessionId) {
    sendBrowserInspectResult(hostPeer, false, undefined, 'No browser session is currently available.');
    sendBrowserState(hostPeer);
    return;
  }

  const browserInstance = getBrowserTabInstance(targetBrowserSessionId);
  if (!browserInstance) {
    sendBrowserInspectResult(hostPeer, false, targetBrowserSessionId, 'Browser surface is not ready.');
    sendBrowserState(hostPeer);
    return;
  }

  const prompt = buildInspectPromptFromSelection(browserInstance, normalizedInstruction);
  if (!prompt) {
    sendBrowserInspectResult(hostPeer, false, targetBrowserSessionId, 'Select an element in inspect mode first.');
    sendBrowserState(hostPeer);
    return;
  }

  const routed = await deliverPromptToTerminalSession(hostPeer.activeSessionId, prompt);
  if (!routed) {
    sendBrowserInspectResult(hostPeer, false, targetBrowserSessionId, 'Target CLI session is not available.');
    sendBrowserState(hostPeer);
    return;
  }

  sendBrowserInspectResult(hostPeer, true, targetBrowserSessionId);
  sendBrowserState(hostPeer);
}

function findHostPeerBySession(sessionId: string): HostPeer | null {
  const direct = hostPeers.get(sessionId);
  if (direct) return direct;
  for (const peer of hostPeers.values()) {
    if (peer.ownerSessionId === sessionId || peer.activeSessionId === sessionId) {
      return peer;
    }
  }
  return null;
}

export interface ShareHandle {
  getOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  stop(): void;
  onConnected(cb: EventCallback): void;
  onDisconnected(cb: EventCallback): void;
  onAuthFailed(cb: (reason: string) => void): void;
}

interface StartShareCallbacks {
  connected: EventCallback[];
  disconnected: EventCallback[];
  authFailed: Array<(reason: string) => void>;
}

function createHostPeer(
  sessionId: string,
  mode: ShareMode,
  passphrase: string,
  serializeAddon: SerializeAddon,
  rtcConfig?: ShareRtcConfig,
): HostPeer {
  const pc = new RTCPeerConnection(buildRtcConfiguration(rtcConfig));
  const dc = pc.createDataChannel('terminal', { ordered: true });

  return {
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
    connectedAtMs: null,
    verifiedAtMs: null,
    lastPingAtMs: null,
    lastPongAtMs: null,
    serializeAddon,
  };
}

function emitConnected(callbacks: EventCallback[]): void {
  for (const cb of callbacks) cb();
}

function emitAuthFailed(callbacks: Array<(reason: string) => void>, reason: string): void {
  for (const cb of callbacks) cb(reason);
}

function sendInitAndStartKeepalive(
  hostPeer: HostPeer,
  ownerSessionId: string,
  mode: ShareMode,
  connectedCbs: EventCallback[],
): void {
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
    sendMessage(hostPeer.dc, initMsg);
    for (let i = 0; i < snapshot.scrollback.length; i += CHUNK_SIZE) {
      sendMessage(hostPeer.dc, { type: 'data', payload: snapshot.scrollback.slice(i, i + CHUNK_SIZE) });
    }
  } else {
    initMsg.scrollback = snapshot.scrollback;
    sendMessage(hostPeer.dc, initMsg);
  }

  sendMessage(hostPeer.dc, { type: 'session-catalog', ...buildSessionCatalog(hostPeer) });
  sendBrowserState(hostPeer);

  hostPeer.keepaliveTimer = setInterval(() => {
    if (!hostPeer.connected) return;
    hostPeer.missedPongs++;
    if (hostPeer.missedPongs > MAX_MISSED_PONGS) {
      stopShare(ownerSessionId);
      return;
    }
    hostPeer.lastPingAtMs = Date.now();
    sendMessage(hostPeer.dc, { type: 'ping' });
  }, KEEPALIVE_INTERVAL);

  emitConnected(connectedCbs);
}

function beginAuthHandshake(
  hostPeer: HostPeer,
  ownerSessionId: string,
  authFailedCbs: Array<(reason: string) => void>,
): void {
  const challenge = generateChallenge();
  hostPeer.authChallenge = challenge;
  hostPeer.authState = 'pending';
  sendMessage(hostPeer.dc, { type: 'auth-challenge', challenge: bytesToHex(challenge) });

  hostPeer.authTimeout = setTimeout(() => {
    if (hostPeer.authState !== 'verified') {
      emitAuthFailed(authFailedCbs, 'Authentication timed out');
      stopShare(ownerSessionId);
    }
  }, AUTH_TIMEOUT);
}

async function verifyAuthResponse(
  hostPeer: HostPeer,
  response: string,
  passphrase: string,
  ownerSessionId: string,
  mode: ShareMode,
  connectedCbs: EventCallback[],
  authFailedCbs: Array<(reason: string) => void>,
): Promise<void> {
  const expected = await computeChallengeResponse(hostPeer.authChallenge!, passphrase);
  if (hostPeer.authTimeout) {
    clearTimeout(hostPeer.authTimeout);
    hostPeer.authTimeout = null;
  }
  if (expected === response) {
    hostPeer.authState = 'verified';
    hostPeer.verifiedAtMs = Date.now();
    sendMessage(hostPeer.dc, { type: 'auth-result', ok: true });
    sendInitAndStartKeepalive(hostPeer, ownerSessionId, mode, connectedCbs);
    return;
  }

  sendMessage(hostPeer.dc, { type: 'auth-result', ok: false, reason: 'Passphrase mismatch' });
  emitAuthFailed(authFailedCbs, 'Passphrase mismatch');
  stopShare(ownerSessionId);
}

function handleSessionSwitchMessage(hostPeer: HostPeer, requestedSessionId: string): void {
  const catalog = buildSessionCatalog(hostPeer);
  const exists = catalog.sessions.some((session) => session.id === requestedSessionId);
  if (!exists) {
    sendMessage(hostPeer.dc, { type: 'session-switch-result', ok: false, reason: 'Session not available.' });
    return;
  }

  const snapshot = getSessionSnapshot(hostPeer, requestedSessionId);
  if (!snapshot) {
    sendMessage(hostPeer.dc, { type: 'session-switch-result', ok: false, reason: 'Session terminal is not available.' });
    return;
  }

  hostPeer.activeSessionId = requestedSessionId;
  const project = findProjectForShare(hostPeer.ownerSessionId);
  if (project) {
    appState.setActiveSession(project.id, requestedSessionId);
  }

  sendMessage(hostPeer.dc, {
    type: 'session-switch-result',
    ok: true,
    sessionId: snapshot.sessionId,
    sessionName: snapshot.sessionName,
    scrollback: snapshot.scrollback,
    cols: snapshot.cols,
    rows: snapshot.rows,
  });
  sendMessage(hostPeer.dc, { type: 'session-catalog', ...buildSessionCatalog(hostPeer) });
  sendBrowserState(hostPeer);
}

function handleBrowserControlMessage(
  hostPeer: HostPeer,
  mode: ShareMode,
  action: ShareBrowserControlAction,
  sessionId?: string,
  viewportLabel?: string,
): void {
  if (mode !== 'readwrite') {
    sendBrowserControlResult(
      hostPeer,
      action,
      false,
      sessionId,
      'Browser controls are disabled in read-only mode.',
    );
    sendBrowserState(hostPeer);
    return;
  }
  handleBrowserControl(hostPeer, action, sessionId, viewportLabel);
}

function handleBrowserInspectSubmitMessage(
  hostPeer: HostPeer,
  mode: ShareMode,
  sessionId: string | undefined,
  instruction: string,
): void {
  if (mode !== 'readwrite') {
    sendBrowserInspectResult(
      hostPeer,
      false,
      sessionId,
      'Inspect submit is disabled in read-only mode.',
    );
    sendBrowserState(hostPeer);
    return;
  }
  void handleBrowserInspectSubmit(hostPeer, sessionId, instruction);
}

function handleVerifiedMessage(hostPeer: HostPeer, mode: ShareMode, msg: ShareMessage): void {
  if (msg.type === 'session-switch') {
    handleSessionSwitchMessage(hostPeer, msg.sessionId);
    return;
  }

  if (msg.type === 'session-catalog-request') {
    sendMessage(hostPeer.dc, { type: 'session-catalog', ...buildSessionCatalog(hostPeer) });
    return;
  }

  if (msg.type === 'browser-state-request') {
    sendBrowserState(hostPeer);
    return;
  }

  if (msg.type === 'browser-control') {
    handleBrowserControlMessage(hostPeer, mode, msg.action, msg.sessionId, msg.viewportLabel);
    return;
  }

  if (msg.type === 'browser-inspect-submit') {
    handleBrowserInspectSubmitMessage(hostPeer, mode, msg.sessionId, msg.instruction);
    return;
  }

  if (msg.type === 'input' && mode === 'readwrite') {
    window.calder.pty.write(hostPeer.activeSessionId, msg.payload);
  } else if (msg.type === 'pong') {
    hostPeer.missedPongs = 0;
    hostPeer.lastPongAtMs = Date.now();
  }
}

function parseShareMessage(raw: string): ShareMessage | null {
  try {
    return JSON.parse(raw) as ShareMessage;
  } catch {
    return null;
  }
}

function createDisconnectHandler(
  ownerSessionId: string,
  hostPeer: HostPeer,
  disconnectedCbs: EventCallback[],
): () => void {
  let disconnectFired = false;
  return () => {
    if (disconnectFired) return;
    disconnectFired = true;
    hostPeer.connected = false;
    cleanup(ownerSessionId);
    for (const cb of disconnectedCbs) cb();
  };
}

function createShareHandle(
  ownerSessionId: string,
  hostPeer: HostPeer,
  passphrase: string,
  callbacks: StartShareCallbacks,
  rtcConfig?: ShareRtcConfig,
): ShareHandle {
  return {
    async getOffer(): Promise<string> {
      const offer = await hostPeer.pc.createOffer();
      await hostPeer.pc.setLocalDescription(offer);
      await waitForIceGathering(hostPeer.pc);
      return encodeConnectionCode(hostPeer.pc.localDescription, passphrase, rtcConfig);
    },
    async acceptAnswer(answer: string): Promise<void> {
      const desc = await decodeConnectionCode(answer, 'answer', passphrase);
      await hostPeer.pc.setRemoteDescription(new RTCSessionDescription(desc));
    },
    stop(): void {
      stopShare(ownerSessionId);
    },
    onConnected(cb: EventCallback): void {
      callbacks.connected.push(cb);
    },
    onDisconnected(cb: EventCallback): void {
      callbacks.disconnected.push(cb);
    },
    onAuthFailed(cb: (reason: string) => void): void {
      callbacks.authFailed.push(cb);
    },
  };
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

  const serializeAddon = new SerializeAddon();
  instance.terminal.loadAddon(serializeAddon);

  const callbacks: StartShareCallbacks = {
    connected: [],
    disconnected: [],
    authFailed: [],
  };

  const hostPeer = createHostPeer(sessionId, mode, passphrase, serializeAddon, rtcConfig);
  const { pc, dc } = hostPeer;
  hostPeers.set(sessionId, hostPeer);

  dc.onopen = () => {
    hostPeer.connected = true;
    hostPeer.connectedAtMs = Date.now();
    hostPeer.verifiedAtMs = null;
    hostPeer.lastPingAtMs = null;
    hostPeer.lastPongAtMs = null;

    beginAuthHandshake(hostPeer, sessionId, callbacks.authFailed);
  };

  dc.onmessage = (event: MessageEvent) => {
    const msg = parseShareMessage(event.data);
    if (!msg) return;

    if (hostPeer.authState === 'pending' && msg.type === 'auth-response') {
      void verifyAuthResponse(
        hostPeer,
        msg.response,
        passphrase,
        sessionId,
        mode,
        callbacks.connected,
        callbacks.authFailed,
      );
      return;
    }

    if (hostPeer.authState !== 'verified') return;
    handleVerifiedMessage(hostPeer, mode, msg);
  };

  const handleDisconnect = createDisconnectHandler(sessionId, hostPeer, callbacks.disconnected);

  dc.onclose = handleDisconnect;

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      handleDisconnect();
    }
  };

  return createShareHandle(sessionId, hostPeer, passphrase, callbacks, rtcConfig);
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
  return findHostPeerBySession(sessionId) !== null;
}

export function isConnected(sessionId: string): boolean {
  return findHostPeerBySession(sessionId)?.connected ?? false;
}

export function getShareConnectionSnapshot(sessionId: string): ShareConnectionSnapshot | null {
  const hostPeer = findHostPeerBySession(sessionId);
  if (!hostPeer) return null;
  return {
    ownerSessionId: hostPeer.ownerSessionId,
    activeSessionId: hostPeer.activeSessionId,
    mode: hostPeer.mode,
    connected: hostPeer.connected,
    authState: hostPeer.authState,
    missedPongs: hostPeer.missedPongs,
    connectedAtMs: hostPeer.connectedAtMs,
    verifiedAtMs: hostPeer.verifiedAtMs,
    lastPingAtMs: hostPeer.lastPingAtMs,
    lastPongAtMs: hostPeer.lastPongAtMs,
  };
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
