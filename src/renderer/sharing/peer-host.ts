// Host-side WebRTC logic for P2P session sharing.
// Uses native RTCPeerConnection (available in Electron's Chromium).

import type { ShareBrowserControlAction, ShareMode, ShareMessage } from '../../shared/sharing-types.js';
import type { SessionRecord, ShareRtcConfig } from '../../shared/types.js';
import { deliverPromptToTerminalSession, getTerminalInstance } from '../components/terminal-pane.js';
import { getBrowserTabInstance } from '../components/browser-tab/instance.js';
import { toggleInspectMode } from '../components/browser-tab/inspect-mode.js';
import { VIEWPORT_PRESETS } from '../components/browser-tab/types.js';
import { applyViewport } from '../components/browser-tab/viewport.js';
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

interface SessionSnapshot {
  sessionId: string;
  sessionName: string;
  scrollback: string;
  cols: number;
  rows: number;
}

interface BrowserSessionSnapshot {
  id: string;
  name: string;
  url: string;
  inspectMode: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportLabel: string;
  selectedElementSummary?: string;
}

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

function isShareableCliSession(session: SessionRecord): boolean {
  return !session.type || session.type === 'claude';
}

function isShareableBrowserSession(session: SessionRecord): boolean {
  return session.type === 'browser-tab';
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

function buildBrowserSessionCatalog(hostPeer: HostPeer): {
  activeBrowserSessionId: string;
  sessions: BrowserSessionSnapshot[];
} {
  const project = findProjectForShare(hostPeer.ownerSessionId);
  if (!project) {
    return {
      activeBrowserSessionId: '',
      sessions: [],
    };
  }

  const sessions = project.sessions
    .filter((session) => isShareableBrowserSession(session))
    .map((session) => {
      const instance = getBrowserTabInstance(session.id);
      if (!instance) return null;
      let canGoBack = false;
      let canGoForward = false;
      try {
        canGoBack = instance.webview.canGoBack();
        canGoForward = instance.webview.canGoForward();
      } catch {
        canGoBack = false;
        canGoForward = false;
      }
      return {
        id: session.id,
        name: session.name,
        url: instance.committedUrl || instance.webview.src || 'about:blank',
        inspectMode: Boolean(instance.inspectMode),
        canGoBack,
        canGoForward,
        viewportLabel: instance.currentViewport.label,
        selectedElementSummary: instance.selectedElement
          ? `<${instance.selectedElement.tagName}> ${instance.selectedElement.activeSelector.value}`
          : undefined,
      } satisfies BrowserSessionSnapshot;
    })
    .filter((entry): entry is BrowserSessionSnapshot => Boolean(entry));

  let activeBrowserSessionId = '';
  const activeProjectSession = project.sessions.find((session) => session.id === project.activeSessionId);
  if (activeProjectSession && isShareableBrowserSession(activeProjectSession)) {
    activeBrowserSessionId = project.activeSessionId;
  } else if (sessions.length > 0) {
    activeBrowserSessionId = sessions[0].id;
  }
  if (activeBrowserSessionId && !sessions.some((session) => session.id === activeBrowserSessionId)) {
    activeBrowserSessionId = sessions[0]?.id ?? '';
  }

  return {
    activeBrowserSessionId,
    sessions,
  };
}

function sendBrowserState(hostPeer: HostPeer): void {
  if (!hostPeer.connected || hostPeer.authState !== 'verified') return;
  sendMessage(hostPeer.dc, {
    type: 'browser-state',
    ...buildBrowserSessionCatalog(hostPeer),
  });
}

function resolveBrowserTargetSessionId(hostPeer: HostPeer, requestedSessionId?: string): string | null {
  const catalog = buildBrowserSessionCatalog(hostPeer);
  if (catalog.sessions.length === 0) return null;
  const normalizedRequested = String(requestedSessionId || '').trim();
  if (normalizedRequested && catalog.sessions.some((session) => session.id === normalizedRequested)) {
    return normalizedRequested;
  }
  if (catalog.activeBrowserSessionId && catalog.sessions.some((session) => session.id === catalog.activeBrowserSessionId)) {
    return catalog.activeBrowserSessionId;
  }
  return catalog.sessions[0]?.id ?? null;
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

function buildInspectPromptFromSelection(
  instance: ReturnType<typeof getBrowserTabInstance>,
  instruction: string,
): string | null {
  if (!instance) return null;
  const info = instance.selectedElement;
  const trimmedInstruction = instruction.trim();
  if (!info || !trimmedInstruction) return null;

  const clickPoint = info.clickPoint
    ? `, point: '${Math.round(info.clickPoint.normalizedX * 100)}% x ${Math.round(info.clickPoint.normalizedY * 100)}%'`
    : '';
  const canvasHint = info.isCanvasLike ? ', surface: canvas-like element' : '';

  return (
    `Regarding the <${info.tagName}> element at ${info.pageUrl} ` +
    `(selector: '${info.activeSelector.value}'` +
    (info.textContent ? `, text: '${info.textContent}'` : '') +
    `${clickPoint}${canvasHint}): ${trimmedInstruction}`
  );
}

function handleBrowserControl(
  hostPeer: HostPeer,
  action: ShareBrowserControlAction,
  requestedSessionId?: string,
  viewportLabel?: string,
): void {
  const targetSessionId = resolveBrowserTargetSessionId(hostPeer, requestedSessionId);
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

  const targetBrowserSessionId = resolveBrowserTargetSessionId(hostPeer, requestedSessionId);
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
    connectedAtMs: null,
    verifiedAtMs: null,
    lastPingAtMs: null,
    lastPongAtMs: null,
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
    sendBrowserState(hostPeer);

    hostPeer.keepaliveTimer = setInterval(() => {
      if (!hostPeer.connected) return;
      hostPeer.missedPongs++;
      if (hostPeer.missedPongs > MAX_MISSED_PONGS) {
        stopShare(sessionId);
        return;
      }
      hostPeer.lastPingAtMs = Date.now();
      sendMessage(dc, { type: 'ping' });
    }, KEEPALIVE_INTERVAL);

    for (const cb of connectedCbs) cb();
  }

  dc.onopen = () => {
    hostPeer.connected = true;
    hostPeer.connectedAtMs = Date.now();
    hostPeer.verifiedAtMs = null;
    hostPeer.lastPingAtMs = null;
    hostPeer.lastPongAtMs = null;

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
          hostPeer.verifiedAtMs = Date.now();
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
      sendBrowserState(hostPeer);
      return;
    }

    if (msg.type === 'session-catalog-request') {
      sendMessage(dc, { type: 'session-catalog', ...buildSessionCatalog(hostPeer) });
      return;
    }

    if (msg.type === 'browser-state-request') {
      sendBrowserState(hostPeer);
      return;
    }

    if (msg.type === 'browser-control') {
      if (mode !== 'readwrite') {
        sendBrowserControlResult(
          hostPeer,
          msg.action,
          false,
          msg.sessionId,
          'Browser controls are disabled in read-only mode.',
        );
        sendBrowserState(hostPeer);
        return;
      }
      handleBrowserControl(hostPeer, msg.action, msg.sessionId, msg.viewportLabel);
      return;
    }

    if (msg.type === 'browser-inspect-submit') {
      if (mode !== 'readwrite') {
        sendBrowserInspectResult(
          hostPeer,
          false,
          msg.sessionId,
          'Inspect submit is disabled in read-only mode.',
        );
        sendBrowserState(hostPeer);
        return;
      }
      void handleBrowserInspectSubmit(hostPeer, msg.sessionId, msg.instruction);
      return;
    }

    if (msg.type === 'input' && mode === 'readwrite') {
      window.calder.pty.write(hostPeer.activeSessionId, msg.payload);
    } else if (msg.type === 'pong') {
      hostPeer.missedPongs = 0;
      hostPeer.lastPongAtMs = Date.now();
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
