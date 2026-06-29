import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTerminalInstance = vi.hoisted(() => vi.fn());
const mockDeliverPromptToTerminalSession = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockWaitForIceGathering = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockEncodeConnectionCode = vi.hoisted(() => vi.fn().mockResolvedValue('encoded-offer'));
const mockDecodeConnectionCode = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ type: 'answer', sdp: 'answer-sdp' }),
);
const mockBuildRtcConfiguration = vi.hoisted(() => vi.fn().mockReturnValue({ iceServers: [] }));
const mockGenerateChallenge = vi.hoisted(() => vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])));
const mockComputeChallengeResponse = vi.hoisted(() =>
  vi.fn().mockResolvedValue('expected-response'),
);
const mockBytesToHex = vi.hoisted(() => vi.fn().mockReturnValue('deadbeef'));
const mockGetBrowserTabInstance = vi.hoisted(() => vi.fn());
const mockToggleInspectMode = vi.hoisted(() => vi.fn());
const mockApplyViewport = vi.hoisted(() => vi.fn());
const serializeAddonInstances = vi.hoisted(
  () => [] as Array<{ serialize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
);

vi.mock('../components/terminal-pane.js', () => ({
  getTerminalInstance: mockGetTerminalInstance,
  deliverPromptToTerminalSession: mockDeliverPromptToTerminalSession,
}));

vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: class MockSerializeAddon {
    serialize = vi.fn(() => 'SCROLLBACK');
    dispose = vi.fn();

    constructor() {
      serializeAddonInstances.push(this);
    }
  },
}));

vi.mock('./webrtc-utils.js', () => ({
  buildRtcConfiguration: mockBuildRtcConfiguration,
  sendMessage: mockSendMessage,
  waitForIceGathering: mockWaitForIceGathering,
  encodeConnectionCode: mockEncodeConnectionCode,
  decodeConnectionCode: mockDecodeConnectionCode,
}));

vi.mock('./share-crypto.js', () => ({
  generateChallenge: mockGenerateChallenge,
  computeChallengeResponse: mockComputeChallengeResponse,
  bytesToHex: mockBytesToHex,
}));

vi.mock('../components/browser-tab/instance.js', () => ({
  getBrowserTabInstance: (sessionId: string) => mockGetBrowserTabInstance(sessionId),
}));

vi.mock('../components/browser-tab/inspect-mode.js', () => ({
  toggleInspectMode: (instance: unknown) => mockToggleInspectMode(instance),
}));

vi.mock('../components/browser-tab/viewport.js', () => ({
  applyViewport: (instance: unknown, preset: unknown) => mockApplyViewport(instance, preset),
}));

vi.mock('../components/browser-tab/types.js', () => ({
  VIEWPORT_PRESETS: [
    { label: 'Responsive', width: null, height: null },
    { label: 'iPhone 14', width: 393, height: 852 },
  ],
}));

import { _resetForTesting as resetAppState, appState } from '../state.js';
import {
  broadcastData,
  broadcastResize,
  getShareConnectionSnapshot,
  isConnected,
  isSharing,
  startShare,
  stopShare,
} from './peer-host.js';

class FakeDataChannel {
  readyState = 'open';
  onopen?: () => void;
  onmessage?: (event: MessageEvent) => void;
  onclose?: () => void;
  close = vi.fn(() => {
    this.onclose?.();
  });
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  oniceconnectionstatechange?: () => void;
  readonly dc = new FakeDataChannel();
  createDataChannel = vi.fn(() => this.dc);
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
  setLocalDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.localDescription = desc;
  });
  setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.remoteDescription = desc;
  });
  close = vi.fn();

  constructor(_config: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }
}

const mockPtyWrite = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  serializeAddonInstances.length = 0;
  FakePeerConnection.instances = [];
  resetAppState();

  vi.stubGlobal('RTCPeerConnection', FakePeerConnection as any);
  vi.stubGlobal('RTCSessionDescription', function RTCSessionDescription(
    desc: RTCSessionDescriptionInit,
  ) {
    return desc;
  } as any);
  vi.stubGlobal('window', {
    calder: {
      store: {
        save: vi.fn(),
        load: vi.fn(),
      },
      pty: {
        write: mockPtyWrite,
      },
    },
  });

  mockGetTerminalInstance.mockReturnValue({
    sessionId: 'Session title',
    terminal: {
      cols: 120,
      rows: 40,
      loadAddon: vi.fn(),
    },
  });
  mockGetBrowserTabInstance.mockReturnValue(undefined);
  mockDeliverPromptToTerminalSession.mockResolvedValue(true);
});

afterEach(() => {
  for (const sessionId of ['session-1', 'session-2']) {
    stopShare(sessionId);
  }
  vi.unstubAllGlobals();
});

describe('peer-host', () => {
  it('throws when there is no terminal instance for the session', () => {
    mockGetTerminalInstance.mockReturnValue(undefined);
    expect(() => startShare('missing', 'readonly', 'secret-1234')).toThrow(/No terminal instance/i);
  });

  it('creates offers and accepts answers through the RTC connection', async () => {
    const handle = startShare('session-1', 'readonly', 'secret-1234');
    const pc = FakePeerConnection.instances[0];

    await expect(handle.getOffer()).resolves.toBe('encoded-offer');
    expect(pc?.createOffer).toHaveBeenCalledTimes(1);
    expect(pc?.setLocalDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });

    await handle.acceptAnswer('answer-code');
    expect(mockDecodeConnectionCode).toHaveBeenCalledWith('answer-code', 'answer', 'secret-1234');
    expect(pc?.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer-sdp' });
  });

  it('completes auth, sends init data, and forwards terminal traffic once verified', async () => {
    const handle = startShare('session-1', 'readwrite', 'secret-1234');
    const connectedSpy = vi.fn();
    handle.onConnected(connectedSpy);

    const pc = FakePeerConnection.instances[0];
    const dc = pc!.dc;

    dc.onopen?.();
    expect(mockBytesToHex).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(mockSendMessage).toHaveBeenCalledWith(dc, {
      type: 'auth-challenge',
      challenge: 'deadbeef',
    });

    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'auth-result', ok: true });
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'init',
        scrollback: 'SCROLLBACK',
        mode: 'readwrite',
        cols: 120,
        rows: 40,
        sessionName: 'Session title',
      }),
    );
    expect(connectedSpy).toHaveBeenCalledTimes(1);
    expect(isSharing('session-1')).toBe(true);

    broadcastData('session-1', 'stdout');
    broadcastResize('session-1', 132, 50);
    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'data', payload: 'stdout' });
    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'resize', cols: 132, rows: 50 });

    dc.onmessage?.({ data: JSON.stringify({ type: 'input', payload: 'pwd\r' }) } as MessageEvent);
    expect(mockPtyWrite).toHaveBeenCalledWith('session-1', 'pwd\r');

    stopShare('session-1');
    expect(serializeAddonInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(dc.close).toHaveBeenCalledTimes(1);
    expect(pc?.close).toHaveBeenCalledTimes(1);
    expect(isSharing('session-1')).toBe(false);
  });

  it('reports auth failures and tears down the share on mismatch', async () => {
    const handle = startShare('session-2', 'readonly', 'secret-1234');
    const authFailedSpy = vi.fn();
    handle.onAuthFailed(authFailedSpy);

    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'wrong-response' }),
    } as MessageEvent);
    await Promise.resolve();

    expect(mockSendMessage).toHaveBeenCalledWith(dc, {
      type: 'auth-result',
      ok: false,
      reason: 'Passphrase mismatch',
    });
    expect(authFailedSpy).toHaveBeenCalledWith('Passphrase mismatch');
    expect(isSharing('session-2')).toBe(false);
  });

  it('tracks connected state, notifies disconnections, and ignores input in readonly mode', async () => {
    const handle = startShare('session-2', 'readonly', 'secret-1234');
    const disconnectedSpy = vi.fn();
    handle.onDisconnected(disconnectedSpy);

    const pc = FakePeerConnection.instances[0]!;
    const dc = pc.dc;
    dc.onopen?.();
    expect(isConnected('session-2')).toBe(true);

    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'input', payload: 'should-not-write' }),
    } as MessageEvent);
    expect(mockPtyWrite).not.toHaveBeenCalled();

    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange?.();
    expect(disconnectedSpy).toHaveBeenCalledTimes(1);
    expect(isConnected('session-2')).toBe(false);
  });

  it('returns connection snapshot details and treats routed active sessions as connected', async () => {
    const project = appState.addProject('Snapshot', '/tmp/snapshot');
    const sessionA = appState.addSession(project.id, 'Session A', undefined, 'claude')!;
    const sessionB = appState.addSession(project.id, 'Session B', undefined, 'claude')!;

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id === sessionA.id) {
        return {
          sessionId: 'Session A',
          terminal: {
            cols: 120,
            rows: 40,
            loadAddon: vi.fn(),
          },
        };
      }
      if (id === sessionB.id) {
        return {
          sessionId: 'Session B',
          terminal: {
            cols: 90,
            rows: 30,
            loadAddon: vi.fn(),
          },
        };
      }
      return undefined;
    });

    const handle = startShare(sessionA.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'session-switch', sessionId: sessionB.id }),
    } as MessageEvent);

    const snapshot = getShareConnectionSnapshot(sessionB.id);
    expect(snapshot).toEqual(
      expect.objectContaining({
        ownerSessionId: sessionA.id,
        activeSessionId: sessionB.id,
        mode: 'readwrite',
        connected: true,
        authState: 'verified',
      }),
    );
    expect(snapshot?.connectedAtMs).toBeTypeOf('number');
    expect(snapshot?.verifiedAtMs).toBeTypeOf('number');
    expect(isConnected(sessionB.id)).toBe(true);

    handle.stop();
  });

  it('blocks session-switch to another session while sharing in readonly mode', async () => {
    const project = appState.addProject('Readonly Switch', '/tmp/readonly-switch');
    const sessionA = appState.addSession(project.id, 'Session A', undefined, 'claude')!;
    const sessionB = appState.addSession(project.id, 'Session B', undefined, 'claude')!;
    appState.setActiveSession(project.id, sessionA.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id === sessionA.id || id === sessionB.id) {
        return {
          sessionId: id === sessionA.id ? 'Session A' : 'Session B',
          terminal: {
            cols: 80,
            rows: 24,
            loadAddon: vi.fn(),
          },
        };
      }
      return undefined;
    });

    const handle = startShare(sessionA.id, 'readonly', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'session-switch', sessionId: sessionB.id }),
    } as MessageEvent);

    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'session-switch-result',
        ok: false,
        reason: 'Session switching is not available in readonly mode.',
      }),
    );
    expect(getShareConnectionSnapshot(sessionA.id)?.activeSessionId).toBe(sessionA.id);

    handle.stop();
  });

  it('clears pending auth timeout when stopped before authentication completes', () => {
    vi.useFakeTimers();
    const handle = startShare('session-2', 'readonly', 'secret-1234');
    const authFailedSpy = vi.fn();
    handle.onAuthFailed(authFailedSpy);

    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    stopShare('session-2');

    vi.advanceTimersByTime(11_000);
    expect(authFailedSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not broadcast data/resize for missing or disconnected sessions', () => {
    const handle = startShare('session-2', 'readonly', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    broadcastData('session-2', 'ignored');
    broadcastResize('session-2', 100, 30);
    broadcastData('missing-session', 'ignored');
    broadcastResize('missing-session', 100, 30);
    expect(mockSendMessage).not.toHaveBeenCalled();

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    return Promise.resolve().then(() => {
      stopShare('session-2');
      mockSendMessage.mockClear();
      broadcastData('session-2', 'still-ignored');
      broadcastResize('session-2', 100, 30);
      expect(mockSendMessage).not.toHaveBeenCalled();
      handle.stop();
    });
  });

  it('switches the active streamed session and routes input/output accordingly', async () => {
    const project = appState.addProject('Switch', '/tmp/switch');
    const sessionA = appState.addSession(project.id, 'Session A', undefined, 'claude')!;
    const sessionB = appState.addSession(project.id, 'Session B', undefined, 'claude')!;
    appState.setActiveSession(project.id, sessionA.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id === sessionA.id) {
        return {
          sessionId: 'Session A',
          terminal: {
            cols: 120,
            rows: 40,
            loadAddon: vi.fn(),
          },
        };
      }
      if (id === sessionB.id) {
        return {
          sessionId: 'Session B',
          terminal: {
            cols: 100,
            rows: 30,
            loadAddon: vi.fn(),
          },
        };
      }
      return undefined;
    });

    const handle = startShare(sessionA.id, 'readwrite', 'secret-1234');
    const pc = FakePeerConnection.instances[0]!;
    const dc = pc.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    dc.onmessage?.({
      data: JSON.stringify({ type: 'session-switch', sessionId: sessionB.id }),
    } as MessageEvent);

    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'session-switch-result',
        ok: true,
        sessionId: sessionB.id,
        sessionName: 'Session B',
      }),
    );
    expect(appState.activeProject?.activeSessionId).toBe(sessionB.id);

    dc.onmessage?.({
      data: JSON.stringify({ type: 'input', payload: 'whoami\r' }),
    } as MessageEvent);
    expect(mockPtyWrite).toHaveBeenCalledWith(sessionB.id, 'whoami\r');

    mockSendMessage.mockClear();
    broadcastData(sessionA.id, 'old session data');
    expect(mockSendMessage).not.toHaveBeenCalled();

    broadcastData(sessionB.id, 'new session data');
    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'data', payload: 'new session data' });

    handle.stop();
  });

  it('exposes browser state and applies browser controls sent from mobile channel', async () => {
    const project = appState.addProject('Browser Control', '/tmp/browser-control');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const browserSession = appState.addBrowserTabSession(project.id, 'https://example.com/')!;
    appState.setActiveSession(project.id, cliSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });

    const fakeBrowserInstance = {
      webview: {
        canGoBack: vi.fn(() => true),
        canGoForward: vi.fn(() => false),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        src: 'https://example.com/',
      },
      committedUrl: 'https://example.com/',
      inspectMode: false,
      currentViewport: { label: 'Responsive' },
      selectedElement: {
        tagName: 'button',
        id: 'continue',
        classes: ['cta-primary'],
        textContent: 'Continue',
        selectors: [],
        activeSelector: {
          type: 'css',
          label: 'CSS',
          value: 'button.cta-primary',
        },
        pageUrl: 'https://example.com/',
      },
    };
    mockGetBrowserTabInstance.mockImplementation((id: string) =>
      id === browserSession.id ? fakeBrowserInstance : undefined,
    );

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({ data: JSON.stringify({ type: 'session-catalog-request' }) } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'session-catalog',
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: cliSession.id,
            name: cliSession.name,
          }),
        ]),
      }),
    );

    mockSendMessage.mockClear();
    dc.onmessage?.({ data: JSON.stringify({ type: 'browser-state-request' }) } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-state',
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: browserSession.id,
            name: browserSession.name,
            url: 'https://example.com/',
            inspectMode: false,
            canGoBack: true,
            canGoForward: false,
            viewportLabel: 'Responsive',
            selectedElementSummary: '<button> button.cta-primary',
          }),
        ]),
      }),
    );

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'reload',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(fakeBrowserInstance.webview.reload).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: true,
        action: 'reload',
        sessionId: browserSession.id,
      }),
    );

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'set-viewport',
        sessionId: browserSession.id,
        viewportLabel: 'iPhone 14',
      }),
    } as MessageEvent);
    expect(mockApplyViewport).toHaveBeenCalledWith(
      fakeBrowserInstance,
      expect.objectContaining({ label: 'iPhone 14' }),
    );

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: 'Verify this button opens checkout flow.',
      }),
    } as MessageEvent);
    await Promise.resolve();

    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      cliSession.id,
      expect.stringContaining("selector: 'button.cta-primary'"),
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: true,
        sessionId: browserSession.id,
      }),
    );

    handle.stop();
  });

  it('ignores malformed or non-auth channel traffic before verification', () => {
    const handle = startShare('session-2', 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    mockSendMessage.mockClear();
    dc.onmessage?.({ data: '{invalid-json' } as MessageEvent);
    dc.onmessage?.({ data: JSON.stringify({ type: 'input', payload: 'ls\r' }) } as MessageEvent);

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockPtyWrite).not.toHaveBeenCalled();
    handle.stop();
  });

  it('returns session-switch error when requested session is not shareable in current catalog', async () => {
    const project = appState.addProject('Switch Guard', '/tmp/switch-guard');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    appState.setActiveSession(project.id, cliSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'session-switch',
        sessionId: 'missing-session-id',
      }),
    } as MessageEvent);

    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'session-switch-result',
        ok: false,
        reason: 'Session not available.',
      }),
    );
    handle.stop();
  });

  it('rejects browser controls and inspect submit requests in readonly mode', async () => {
    const project = appState.addProject('Readonly Browser Guard', '/tmp/readonly-browser-guard');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const browserSession = appState.addBrowserTabSession(project.id, 'https://example.com/')!;
    appState.setActiveSession(project.id, cliSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });
    mockGetBrowserTabInstance.mockImplementation((id: string) => {
      if (id !== browserSession.id) return undefined;
      return {
        webview: {
          canGoBack: vi.fn(() => false),
          canGoForward: vi.fn(() => false),
          goBack: vi.fn(),
          goForward: vi.fn(),
          reload: vi.fn(),
          src: 'https://example.com/',
        },
        committedUrl: 'https://example.com/',
        inspectMode: false,
        currentViewport: { label: 'Responsive' },
        selectedElement: undefined,
      };
    });

    const handle = startShare(cliSession.id, 'readonly', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'reload',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        action: 'reload',
        sessionId: browserSession.id,
      }),
    );

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: 'Try to inspect this element.',
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: false,
        sessionId: browserSession.id,
      }),
    );
    expect(mockDeliverPromptToTerminalSession).not.toHaveBeenCalled();
    handle.stop();
  });

  it('updates keepalive snapshot fields after ping and pong exchange', async () => {
    vi.useFakeTimers();
    try {
      const handle = startShare('session-2', 'readwrite', 'secret-1234');
      const dc = FakePeerConnection.instances[0]!.dc;

      dc.onopen?.();
      dc.onmessage?.({
        data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
      } as MessageEvent);
      await Promise.resolve();

      vi.advanceTimersByTime(30_000);
      const afterPing = getShareConnectionSnapshot('session-2');
      expect(afterPing?.missedPongs).toBe(1);
      expect(afterPing?.lastPingAtMs).toBeTypeOf('number');

      dc.onmessage?.({ data: JSON.stringify({ type: 'pong' }) } as MessageEvent);
      const afterPong = getShareConnectionSnapshot('session-2');
      expect(afterPong?.missedPongs).toBe(0);
      expect(afterPong?.lastPongAtMs).toBeTypeOf('number');

      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires disconnect callback only once across channel close and ICE failure', () => {
    const handle = startShare('session-2', 'readonly', 'secret-1234');
    const disconnectedSpy = vi.fn();
    handle.onDisconnected(disconnectedSpy);

    const pc = FakePeerConnection.instances[0]!;
    const dc = pc.dc;

    dc.onopen?.();
    dc.onclose?.();
    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange?.();

    expect(disconnectedSpy).toHaveBeenCalledTimes(1);
    expect(isConnected('session-2')).toBe(false);
  });

  it('falls back to an empty catalog when session snapshots disappear', async () => {
    const handle = startShare('session-1', 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    mockGetTerminalInstance.mockReturnValue(undefined);
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'auth-result', ok: true });
    expect(mockSendMessage.mock.calls.some(([, payload]) => payload.type === 'init')).toBe(false);

    mockSendMessage.mockClear();
    dc.onmessage?.({ data: JSON.stringify({ type: 'session-catalog-request' }) } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(dc, {
      type: 'session-catalog',
      activeSessionId: 'session-1',
      sessions: [],
    });

    handle.stop();
  });

  it('moves active session to the first available terminal in session catalog', async () => {
    const project = appState.addProject('Catalog Repair', '/tmp/catalog-repair');
    const sessionA = appState.addSession(project.id, 'Session A', undefined, 'claude')!;
    const sessionB = appState.addSession(project.id, 'Session B', undefined, 'claude')!;
    appState.setActiveSession(project.id, sessionA.id);

    const terminalA = {
      sessionId: 'Session A',
      terminal: {
        cols: 120,
        rows: 40,
        loadAddon: vi.fn(),
      },
    };
    const terminalB = {
      sessionId: 'Session B',
      terminal: {
        cols: 100,
        rows: 30,
        loadAddon: vi.fn(),
      },
    };

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id === sessionA.id) return terminalA;
      if (id === sessionB.id) return terminalB;
      return undefined;
    });

    const handle = startShare(sessionA.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;

    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id === sessionA.id) return undefined;
      if (id === sessionB.id) return terminalB;
      return undefined;
    });

    mockSendMessage.mockClear();
    dc.onmessage?.({ data: JSON.stringify({ type: 'session-catalog-request' }) } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'session-catalog',
        activeSessionId: sessionB.id,
        sessions: [{ id: sessionB.id, name: sessionB.name }],
      }),
    );
    expect(getShareConnectionSnapshot(sessionB.id)?.activeSessionId).toBe(sessionB.id);

    handle.stop();
  });

  it('builds browser state using available sessions and survives webview history probe errors', async () => {
    const project = appState.addProject('Browser Catalog Repair', '/tmp/browser-catalog-repair');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const staleBrowserSession = appState.addBrowserTabSession(
      project.id,
      'https://stale.example.com/',
    )!;
    const readyBrowserSession = appState.addBrowserTabSession(
      project.id,
      'https://ready.example.com/',
    )!;
    appState.setActiveSession(project.id, staleBrowserSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });
    mockGetBrowserTabInstance.mockImplementation((id: string) => {
      if (id === staleBrowserSession.id) return undefined;
      if (id !== readyBrowserSession.id) return undefined;
      return {
        webview: {
          canGoBack: vi.fn(() => {
            throw new Error('webview not ready');
          }),
          canGoForward: vi.fn(() => true),
          goBack: vi.fn(),
          goForward: vi.fn(),
          reload: vi.fn(),
          src: 'https://ready.example.com/',
        },
        committedUrl: 'https://ready.example.com/',
        inspectMode: false,
        currentViewport: { label: 'Responsive' },
        selectedElement: undefined,
      };
    });

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({ data: JSON.stringify({ type: 'browser-state-request' }) } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-state',
        activeBrowserSessionId: readyBrowserSession.id,
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: readyBrowserSession.id,
            canGoBack: false,
            canGoForward: false,
          }),
        ]),
      }),
    );

    handle.stop();
  });

  it('reports browser-control failures for unavailable targets and runtime errors', async () => {
    const project = appState.addProject('Browser Errors', '/tmp/browser-errors');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const browserSession = appState.addBrowserTabSession(project.id, 'https://example.com/')!;
    appState.setActiveSession(project.id, cliSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });

    const browserInstance = {
      webview: {
        canGoBack: vi.fn(() => true),
        canGoForward: vi.fn(() => true),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(() => {
          throw new Error('reload failed');
        }),
        src: 'https://example.com/',
      },
      committedUrl: 'https://example.com/',
      inspectMode: false,
      currentViewport: { label: 'Responsive' },
      selectedElement: undefined,
    };

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockGetBrowserTabInstance.mockReturnValue(undefined);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'reload',
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        reason: 'No browser session is currently available.',
      }),
    );

    let browserLookups = 0;
    mockGetBrowserTabInstance.mockImplementation((id: string) => {
      if (id !== browserSession.id) return undefined;
      browserLookups++;
      return browserLookups === 1 ? browserInstance : undefined;
    });
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'reload',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        sessionId: browserSession.id,
        reason: 'Browser surface is not ready.',
      }),
    );

    mockGetBrowserTabInstance.mockReturnValue(browserInstance);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'unknown-action',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        sessionId: browserSession.id,
        reason: 'Browser action is not supported.',
      }),
    );

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'reload',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        sessionId: browserSession.id,
        reason: 'reload failed',
      }),
    );

    handle.stop();
  });

  it('handles browser-control actions for back/forward/toggle and invalid viewport presets', async () => {
    const project = appState.addProject('Browser Controls Matrix', '/tmp/browser-controls-matrix');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const browserSession = appState.addBrowserTabSession(project.id, 'https://example.com/')!;
    appState.setActiveSession(project.id, cliSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });

    const browserInstance = {
      webview: {
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        src: 'https://example.com/',
      },
      committedUrl: 'https://example.com/',
      inspectMode: false,
      currentViewport: { label: 'Responsive' },
      selectedElement: undefined,
    };
    mockGetBrowserTabInstance.mockReturnValue(browserInstance);

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'back',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        action: 'back',
        reason: 'No page behind this one yet.',
      }),
    );

    browserInstance.webview.canGoBack.mockImplementation(() => true);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'back',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(browserInstance.webview.goBack).toHaveBeenCalledTimes(1);

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'forward',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        action: 'forward',
        reason: 'No forward page yet.',
      }),
    );

    browserInstance.webview.canGoForward.mockImplementation(() => true);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'forward',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(browserInstance.webview.goForward).toHaveBeenCalledTimes(1);

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'toggle-inspect',
        sessionId: browserSession.id,
      }),
    } as MessageEvent);
    expect(mockToggleInspectMode).toHaveBeenCalledWith(browserInstance);

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'set-viewport',
        sessionId: browserSession.id,
        viewportLabel: 'NotARealPreset',
      }),
    } as MessageEvent);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: false,
        action: 'set-viewport',
        reason: 'Viewport preset is not recognized.',
      }),
    );

    handle.stop();
  });

  it('reports browser inspect-submit validation and routing failures', async () => {
    const project = appState.addProject('Browser Inspect Errors', '/tmp/browser-inspect-errors');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const browserSession = appState.addBrowserTabSession(project.id, 'https://example.com/')!;
    appState.setActiveSession(project.id, cliSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });

    const selectedElement = {
      tagName: 'button',
      id: 'continue',
      classes: ['cta-primary'],
      textContent: 'Continue',
      selectors: [],
      activeSelector: {
        type: 'css',
        label: 'CSS',
        value: 'button.cta-primary',
      },
      pageUrl: 'https://example.com/',
    };

    const browserInstance = {
      webview: {
        canGoBack: vi.fn(() => true),
        canGoForward: vi.fn(() => true),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        src: 'https://example.com/',
      },
      committedUrl: 'https://example.com/',
      inspectMode: true,
      currentViewport: { label: 'Responsive' },
      selectedElement: undefined as typeof selectedElement | undefined,
    };

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockGetBrowserTabInstance.mockReturnValue(browserInstance);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: '   ',
      }),
    } as MessageEvent);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: false,
        reason: 'Inspect instruction is required.',
      }),
    );

    mockGetBrowserTabInstance.mockReturnValue(undefined);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: 'Inspect this element',
      }),
    } as MessageEvent);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: false,
        reason: 'No browser session is currently available.',
      }),
    );

    let browserLookups = 0;
    mockGetBrowserTabInstance.mockImplementation((id: string) => {
      if (id !== browserSession.id) return undefined;
      browserLookups++;
      return browserLookups === 1 ? browserInstance : undefined;
    });
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: 'Inspect this element',
      }),
    } as MessageEvent);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: false,
        sessionId: browserSession.id,
        reason: 'Browser surface is not ready.',
      }),
    );

    mockGetBrowserTabInstance.mockReturnValue(browserInstance);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: 'Inspect this element',
      }),
    } as MessageEvent);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: false,
        sessionId: browserSession.id,
        reason: 'Select an element in inspect mode first.',
      }),
    );

    browserInstance.selectedElement = selectedElement;
    mockDeliverPromptToTerminalSession.mockResolvedValue(false);
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-inspect-submit',
        sessionId: browserSession.id,
        instruction: 'Inspect this element',
      }),
    } as MessageEvent);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-inspect-result',
        ok: false,
        sessionId: browserSession.id,
        reason: 'Target CLI session is not available.',
      }),
    );

    handle.stop();
  });

  it('chunks large init scrollback and stops on auth timeout or too many missed pongs', async () => {
    vi.useFakeTimers();
    try {
      const longScrollback = 'x'.repeat(70_000);
      const timeoutHandle = startShare('session-1', 'readwrite', 'secret-1234');
      const timeoutAuthFailed = vi.fn();
      timeoutHandle.onAuthFailed(timeoutAuthFailed);
      const timeoutDc = FakePeerConnection.instances[0]!.dc;
      timeoutDc.onopen?.();

      vi.advanceTimersByTime(10_000);
      expect(timeoutAuthFailed).toHaveBeenCalledWith('Authentication timed out');
      expect(isSharing('session-1')).toBe(false);

      const keepaliveHandle = startShare('session-2', 'readwrite', 'secret-1234');
      serializeAddonInstances[serializeAddonInstances.length - 1]!.serialize.mockReturnValue(
        longScrollback,
      );
      const keepaliveDc = FakePeerConnection.instances[1]!.dc;
      keepaliveDc.onopen?.();
      keepaliveDc.onmessage?.({
        data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
      } as MessageEvent);
      await Promise.resolve();

      const initCalls = mockSendMessage.mock.calls.filter(([, payload]) => payload.type === 'init');
      expect(initCalls).toHaveLength(1);
      expect(initCalls[0]?.[1]).toEqual(expect.objectContaining({ scrollback: '' }));

      const dataCalls = mockSendMessage.mock.calls
        .filter(([, payload]) => payload.type === 'data')
        .map(([, payload]) => payload.payload);
      expect(dataCalls.length).toBeGreaterThan(1);
      expect(dataCalls.join('')).toBe(longScrollback);

      vi.advanceTimersByTime(30_000 * 4);
      expect(isSharing('session-2')).toBe(false);

      keepaliveHandle.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns session-switch error when terminal disappears after catalog resolution', async () => {
    const project = appState.addProject('Switch Snapshot Guard', '/tmp/switch-snapshot-guard');
    const sessionA = appState.addSession(project.id, 'Session A', undefined, 'claude')!;
    const sessionB = appState.addSession(project.id, 'Session B', undefined, 'claude')!;
    appState.setActiveSession(project.id, sessionA.id);

    const terminalA = {
      sessionId: 'Session A',
      terminal: {
        cols: 120,
        rows: 40,
        loadAddon: vi.fn(),
      },
    };
    const terminalB = {
      sessionId: 'Session B',
      terminal: {
        cols: 100,
        rows: 30,
        loadAddon: vi.fn(),
      },
    };

    let simulateVanishedTerminal = false;
    let sessionBLookups = 0;
    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id === sessionA.id) return terminalA;
      if (id !== sessionB.id) return undefined;
      if (!simulateVanishedTerminal) return terminalB;
      sessionBLookups++;
      return sessionBLookups === 1 ? terminalB : undefined;
    });

    const handle = startShare(sessionA.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    simulateVanishedTerminal = true;
    sessionBLookups = 0;
    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'session-switch',
        sessionId: sessionB.id,
      }),
    } as MessageEvent);

    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'session-switch-result',
        ok: false,
        reason: 'Session terminal is not available.',
      }),
    );

    handle.stop();
  });

  it('falls back to active browser session when requested browser session id is invalid', async () => {
    const project = appState.addProject('Browser Target Fallback', '/tmp/browser-target-fallback');
    const cliSession = appState.addSession(project.id, 'CLI Session', undefined, 'claude')!;
    const browserSession = appState.addBrowserTabSession(project.id, 'https://example.com/')!;
    appState.setActiveSession(project.id, browserSession.id);

    mockGetTerminalInstance.mockImplementation((id: string) => {
      if (id !== cliSession.id) return undefined;
      return {
        sessionId: 'CLI Session',
        terminal: {
          cols: 120,
          rows: 40,
          loadAddon: vi.fn(),
        },
      };
    });

    const browserInstance = {
      webview: {
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        src: 'https://example.com/',
      },
      committedUrl: 'https://example.com/',
      inspectMode: false,
      currentViewport: { label: 'Responsive' },
      selectedElement: undefined,
    };
    mockGetBrowserTabInstance.mockImplementation((id: string) => {
      if (id !== browserSession.id) return undefined;
      return browserInstance;
    });

    const handle = startShare(cliSession.id, 'readwrite', 'secret-1234');
    const dc = FakePeerConnection.instances[0]!.dc;
    dc.onopen?.();
    dc.onmessage?.({
      data: JSON.stringify({ type: 'auth-response', response: 'expected-response' }),
    } as MessageEvent);
    await Promise.resolve();

    mockSendMessage.mockClear();
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'browser-control',
        action: 'reload',
        sessionId: 'invalid-browser-id',
      }),
    } as MessageEvent);
    expect(browserInstance.webview.reload).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      dc,
      expect.objectContaining({
        type: 'browser-control-result',
        ok: true,
        sessionId: browserSession.id,
      }),
    );

    handle.stop();
  });
});
