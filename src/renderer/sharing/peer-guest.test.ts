import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendMessage = vi.hoisted(() => vi.fn());
const mockWaitForIceGathering = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockEncodeConnectionCode = vi.hoisted(() => vi.fn().mockResolvedValue('encoded-answer'));
const mockDecodeConnectionEnvelope = vi.hoisted(() => vi.fn().mockResolvedValue({
  description: { type: 'offer', sdp: 'offer-sdp' },
  rtcConfig: { iceServers: [{ urls: 'turn:turn.example.com:3478' }], iceTransportPolicy: 'relay' },
}));
const mockBuildRtcConfiguration = vi.hoisted(() => vi.fn().mockReturnValue({ iceServers: [] }));
const mockComputeChallengeResponse = vi.hoisted(() => vi.fn().mockResolvedValue('signed-response'));
const mockHexToBytes = vi.hoisted(() => vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])));

vi.mock('./webrtc-utils.js', () => ({
  buildRtcConfiguration: mockBuildRtcConfiguration,
  sendMessage: mockSendMessage,
  waitForIceGathering: mockWaitForIceGathering,
  encodeConnectionCode: mockEncodeConnectionCode,
  decodeConnectionEnvelope: mockDecodeConnectionEnvelope,
}));

vi.mock('./share-crypto.js', () => ({
  computeChallengeResponse: mockComputeChallengeResponse,
  hexToBytes: mockHexToBytes,
}));

import { joinShare } from './peer-guest.js';

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

  ondatachannel?: (event: RTCDataChannelEvent) => void;
  oniceconnectionstatechange?: () => void;
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.remoteDescription = desc;
  });
  setConfiguration = vi.fn((_config: RTCConfiguration) => {});
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' }));
  setLocalDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.localDescription = desc;
  });
  close = vi.fn();

  constructor(_config: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  FakePeerConnection.instances = [];

  vi.stubGlobal('RTCPeerConnection', FakePeerConnection as any);
  vi.stubGlobal('RTCSessionDescription', function RTCSessionDescription(desc: RTCSessionDescriptionInit) {
    return desc;
  } as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('peer-guest', () => {
  it('creates an answer from the remote offer', async () => {
    const { guestId, handle } = joinShare('offer-code', 'secret-1234');
    const answer = await handle.getAnswer();
    const pc = FakePeerConnection.instances[0];

    expect(guestId).toMatch(/^guest-\d+$/);
    expect(mockDecodeConnectionEnvelope).toHaveBeenCalledWith('offer-code', 'offer', 'secret-1234');
    expect(pc?.setConfiguration).toHaveBeenCalledWith({ iceServers: [] });
    expect(pc?.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });
    expect(pc?.setLocalDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer-sdp' });
    expect(answer).toBe('encoded-answer');
  });

  it('handles auth, init, data, resize, ping, and end messages over the data channel', async () => {
    const { handle } = joinShare('offer-code', 'secret-1234');
    const initSpy = vi.fn();
    const dataSpy = vi.fn();
    const resizeSpy = vi.fn();
    const endSpy = vi.fn();
    const disconnectedSpy = vi.fn();

    handle.onInit(initSpy);
    handle.onData(dataSpy);
    handle.onResize(resizeSpy);
    handle.onEnd(endSpy);
    handle.onDisconnected(disconnectedSpy);

    const pc = FakePeerConnection.instances[0];
    const dc = new FakeDataChannel();
    pc?.ondatachannel?.({ channel: dc } as unknown as RTCDataChannelEvent);
    dc.onopen?.();

    dc.onmessage?.({ data: JSON.stringify({ type: 'auth-challenge', challenge: 'abcd' }) } as MessageEvent);
    await Promise.resolve();
    expect(mockHexToBytes).toHaveBeenCalledWith('abcd');
    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'auth-response', response: 'signed-response' });

    dc.onmessage?.({ data: JSON.stringify({ type: 'auth-result', ok: true }) } as MessageEvent);
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'init',
        scrollback: 'boot log',
        mode: 'readwrite',
        cols: 120,
        rows: 40,
        sessionName: 'Shared shell',
      }),
    } as MessageEvent);
    expect(initSpy).toHaveBeenCalledWith({
      scrollback: 'boot log',
      mode: 'readwrite',
      cols: 120,
      rows: 40,
      sessionName: 'Shared shell',
    });

    handle.sendInput('pwd\r');
    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'input', payload: 'pwd\r' });

    dc.onmessage?.({ data: JSON.stringify({ type: 'data', payload: 'next chunk' }) } as MessageEvent);
    dc.onmessage?.({ data: JSON.stringify({ type: 'resize', cols: 132, rows: 50 }) } as MessageEvent);
    dc.onmessage?.({ data: JSON.stringify({ type: 'ping' }) } as MessageEvent);

    expect(dataSpy).toHaveBeenCalledWith('next chunk');
    expect(resizeSpy).toHaveBeenCalledWith(132, 50);
    expect(mockSendMessage).toHaveBeenCalledWith(dc, { type: 'pong' });

    dc.onmessage?.({ data: JSON.stringify({ type: 'end' }) } as MessageEvent);
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(disconnectedSpy).toHaveBeenCalledTimes(1);
    expect(pc?.close).toHaveBeenCalledTimes(1);
  });

  it('reports auth failure and disconnects when the host rejects the passphrase', () => {
    const { handle } = joinShare('offer-code', 'secret-1234');
    const authFailedSpy = vi.fn();
    const disconnectedSpy = vi.fn();
    handle.onAuthFailed(authFailedSpy);
    handle.onDisconnected(disconnectedSpy);

    const pc = FakePeerConnection.instances[0];
    const dc = new FakeDataChannel();
    pc?.ondatachannel?.({ channel: dc } as unknown as RTCDataChannelEvent);
    dc.onopen?.();

    dc.onmessage?.({ data: JSON.stringify({ type: 'auth-result', ok: false, reason: 'Passphrase mismatch' }) } as MessageEvent);

    expect(authFailedSpy).toHaveBeenCalledWith('Passphrase mismatch');
    expect(disconnectedSpy).toHaveBeenCalledTimes(1);
    expect(pc?.close).toHaveBeenCalledTimes(1);
  });
});
