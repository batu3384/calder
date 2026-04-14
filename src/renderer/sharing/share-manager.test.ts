import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStartShare = vi.hoisted(() => vi.fn());
const mockStopShare = vi.hoisted(() => vi.fn());
const mockBroadcastData = vi.hoisted(() => vi.fn());
const mockBroadcastResize = vi.hoisted(() => vi.fn());
const mockIsSharing = vi.hoisted(() => vi.fn());
const mockJoinShare = vi.hoisted(() => vi.fn());
const mockAddRemoteSession = vi.hoisted(() => vi.fn());
const mockAppStateOn = vi.hoisted(() => vi.fn());
const mockCreateRemoteTerminalPane = vi.hoisted(() => vi.fn());
const mockWriteRemoteData = vi.hoisted(() => vi.fn());
const mockShowRemoteEndOverlay = vi.hoisted(() => vi.fn());
const mockDestroyRemoteTerminal = vi.hoisted(() => vi.fn());

vi.mock('./peer-host.js', () => ({
  startShare: mockStartShare,
  stopShare: mockStopShare,
  broadcastData: mockBroadcastData,
  broadcastResize: mockBroadcastResize,
  isSharing: mockIsSharing,
}));

vi.mock('./peer-guest.js', () => ({
  joinShare: mockJoinShare,
}));

vi.mock('../state.js', () => ({
  appState: {
    addRemoteSession: mockAddRemoteSession,
    on: mockAppStateOn,
  },
}));

vi.mock('../components/remote-terminal-pane.js', () => ({
  createRemoteTerminalPane: mockCreateRemoteTerminalPane,
  writeRemoteData: mockWriteRemoteData,
  showRemoteEndOverlay: mockShowRemoteEndOverlay,
  destroyRemoteTerminal: mockDestroyRemoteTerminal,
}));

import {
  _resetForTesting,
  acceptShareAnswer,
  cleanupAllShares,
  disconnectRemoteSession,
  endShare,
  forwardPtyData,
  forwardResize,
  initShareManager,
  isRemoteSession,
  joinRemoteSession,
  onShareChange,
  shareSession,
} from './share-manager.js';

interface HostHandleMock {
  getOffer: ReturnType<typeof vi.fn>;
  acceptAnswer: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onConnected: ReturnType<typeof vi.fn>;
  onDisconnected: ReturnType<typeof vi.fn>;
  onAuthFailed: ReturnType<typeof vi.fn>;
  emitConnected: () => void;
  emitDisconnected: () => void;
}

interface GuestHandleMock {
  getAnswer: ReturnType<typeof vi.fn>;
  sendInput: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onInit: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onResize: ReturnType<typeof vi.fn>;
  onDisconnected: ReturnType<typeof vi.fn>;
  onEnd: ReturnType<typeof vi.fn>;
  onAuthFailed: ReturnType<typeof vi.fn>;
  emitInit: (payload: {
    scrollback: string;
    mode: 'readonly' | 'readwrite';
    cols: number;
    rows: number;
    sessionName: string;
  }) => void;
  emitData: (payload: string) => void;
  emitDisconnected: () => void;
}

function createHostHandle(): HostHandleMock {
  let connectedCb: (() => void) | undefined;
  let disconnectedCb: (() => void) | undefined;

  return {
    getOffer: vi.fn().mockResolvedValue('offer-code'),
    acceptAnswer: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    onConnected: vi.fn((cb: () => void) => {
      connectedCb = cb;
    }),
    onDisconnected: vi.fn((cb: () => void) => {
      disconnectedCb = cb;
    }),
    onAuthFailed: vi.fn(),
    emitConnected: () => connectedCb?.(),
    emitDisconnected: () => disconnectedCb?.(),
  };
}

function createGuestHandle(): GuestHandleMock {
  let initCb: ((payload: {
    scrollback: string;
    mode: 'readonly' | 'readwrite';
    cols: number;
    rows: number;
    sessionName: string;
  }) => void) | undefined;
  let dataCb: ((payload: string) => void) | undefined;
  let disconnectedCb: (() => void) | undefined;

  return {
    getAnswer: vi.fn().mockResolvedValue('answer-code'),
    sendInput: vi.fn(),
    disconnect: vi.fn(),
    onInit: vi.fn((cb) => {
      initCb = cb;
    }),
    onData: vi.fn((cb) => {
      dataCb = cb;
    }),
    onResize: vi.fn(),
    onDisconnected: vi.fn((cb) => {
      disconnectedCb = cb;
    }),
    onEnd: vi.fn(),
    onAuthFailed: vi.fn(),
    emitInit: (payload) => initCb?.(payload),
    emitData: (payload) => dataCb?.(payload),
    emitDisconnected: () => disconnectedCb?.(),
  };
}

let sessionRemovedListener: ((payload?: unknown) => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTesting();
  sessionRemovedListener = undefined;

  mockAppStateOn.mockImplementation((event: string, cb: (payload?: unknown) => void) => {
    if (event === 'session-removed') {
      sessionRemovedListener = cb;
    }
  });
  mockAddRemoteSession.mockReturnValue({ id: 'remote-session-1' });
  mockIsSharing.mockReturnValue(false);

  vi.stubGlobal('crypto', {
    ...globalThis.crypto,
    randomUUID: () => 'remote-session-1',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetForTesting();
});

describe('share-manager host flow', () => {
  it('shares a session, forwards answers, and notifies listeners on lifecycle changes', async () => {
    const handle = createHostHandle();
    mockStartShare.mockReturnValue(handle);
    const listener = vi.fn();
    onShareChange(listener);

    const result = await shareSession('session-1', 'readonly', 'secret-1234');
    expect(result.offer).toBe('offer-code');
    expect(result.handle).toBe(handle);
    expect(mockStartShare).toHaveBeenCalledWith('session-1', 'readonly', 'secret-1234');
    expect(listener).toHaveBeenCalledTimes(1);

    await acceptShareAnswer('session-1', 'answer-code');
    expect(handle.acceptAnswer).toHaveBeenCalledWith('answer-code');

    handle.emitConnected();
    handle.emitDisconnected();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('ends shares and forwards PTY traffic to the host peer', async () => {
    const handle = createHostHandle();
    mockStartShare.mockReturnValue(handle);

    await shareSession('session-2', 'readwrite', 'secret-1234');
    forwardPtyData('session-2', 'ls -la');
    forwardResize('session-2', 120, 40);
    endShare('session-2');

    expect(mockBroadcastData).toHaveBeenCalledWith('session-2', 'ls -la');
    expect(mockBroadcastResize).toHaveBeenCalledWith('session-2', 120, 40);
    expect(mockStopShare).toHaveBeenCalledWith('session-2');
  });

  it('throws when accepting an answer for a missing share', async () => {
    await expect(acceptShareAnswer('missing', 'answer-code')).rejects.toThrow(/No active share/i);
  });
});

describe('share-manager guest flow', () => {
  it('creates a remote session after init and wires data/disconnect handlers', async () => {
    const handle = createGuestHandle();
    mockJoinShare.mockReturnValue({ handle });
    const onConnected = vi.fn();

    const result = await joinRemoteSession('project-1', 'offer-code', 'secret-1234', onConnected);
    expect(result.answer).toBe('answer-code');

    handle.emitInit({
      scrollback: 'boot log',
      mode: 'readwrite',
      cols: 132,
      rows: 42,
      sessionName: 'Shared shell',
    });

    expect(mockCreateRemoteTerminalPane).toHaveBeenCalledWith(
      'remote-session-1',
      'readwrite',
      132,
      42,
      expect.any(Function),
    );
    expect(mockCreateRemoteTerminalPane.mock.invocationCallOrder[0]).toBeLessThan(
      mockAddRemoteSession.mock.invocationCallOrder[0],
    );
    expect(mockWriteRemoteData).toHaveBeenCalledWith('remote-session-1', 'boot log');
    expect(mockAddRemoteSession).toHaveBeenCalledWith('project-1', 'remote-session-1', 'Shared shell', 'readwrite');
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(isRemoteSession('remote-session-1')).toBe(true);

    handle.emitData('next chunk');
    expect(mockWriteRemoteData).toHaveBeenCalledWith('remote-session-1', 'next chunk');

    const onInput = mockCreateRemoteTerminalPane.mock.calls[0][4] as (data: string) => void;
    onInput('pwd\r');
    expect(handle.sendInput).toHaveBeenCalledWith('pwd\r');

    handle.emitDisconnected();
    expect(mockShowRemoteEndOverlay).toHaveBeenCalledWith('remote-session-1');
    expect(isRemoteSession('remote-session-1')).toBe(false);
  });

  it('cleans up and disconnects if the remote session cannot be added to state', async () => {
    const handle = createGuestHandle();
    mockJoinShare.mockReturnValue({ handle });
    mockAddRemoteSession.mockReturnValue(null);

    await joinRemoteSession('project-1', 'offer-code', 'secret-1234');
    handle.emitInit({
      scrollback: '',
      mode: 'readonly',
      cols: 80,
      rows: 24,
      sessionName: 'Shared shell',
    });

    expect(mockDestroyRemoteTerminal).toHaveBeenCalledWith('remote-session-1');
    expect(handle.disconnect).toHaveBeenCalledTimes(1);
    expect(isRemoteSession('remote-session-1')).toBe(false);
  });

  it('disconnects active and pending guest sessions during cleanup', async () => {
    const activeHandle = createGuestHandle();
    mockJoinShare.mockReturnValueOnce({ handle: activeHandle });

    await joinRemoteSession('project-1', 'offer-code', 'secret-1234');
    activeHandle.emitInit({
      scrollback: '',
      mode: 'readonly',
      cols: 80,
      rows: 24,
      sessionName: 'Shared shell',
    });

    const pendingHandle = createGuestHandle();
    mockJoinShare.mockReturnValueOnce({ handle: pendingHandle });
    await joinRemoteSession('project-1', 'offer-code', 'secret-1234');

    cleanupAllShares();

    expect(activeHandle.disconnect).toHaveBeenCalledTimes(1);
    expect(pendingHandle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects a specific remote session on demand', async () => {
    const handle = createGuestHandle();
    mockJoinShare.mockReturnValue({ handle });

    await joinRemoteSession('project-1', 'offer-code', 'secret-1234');
    handle.emitInit({
      scrollback: '',
      mode: 'readonly',
      cols: 80,
      rows: 24,
      sessionName: 'Shared shell',
    });

    disconnectRemoteSession('remote-session-1');

    expect(handle.disconnect).toHaveBeenCalledTimes(1);
    expect(isRemoteSession('remote-session-1')).toBe(false);
  });
});

describe('initShareManager', () => {
  it('tears down host and guest sessions when the backing session is removed', async () => {
    const hostHandle = createHostHandle();
    mockStartShare.mockReturnValue(hostHandle);
    mockIsSharing.mockImplementation((sessionId: string) => sessionId === 'session-9');
    await shareSession('session-9', 'readonly', 'secret-1234');

    const guestHandle = createGuestHandle();
    mockJoinShare.mockReturnValue({ handle: guestHandle });
    await joinRemoteSession('project-1', 'offer-code', 'secret-1234');
    guestHandle.emitInit({
      scrollback: '',
      mode: 'readonly',
      cols: 80,
      rows: 24,
      sessionName: 'Shared shell',
    });

    initShareManager();
    sessionRemovedListener?.({ sessionId: 'remote-session-1' });
    sessionRemovedListener?.({ sessionId: 'session-9' });

    expect(mockStopShare).toHaveBeenCalledWith('session-9');
    expect(mockDestroyRemoteTerminal).toHaveBeenCalledWith('remote-session-1');
  });
});
