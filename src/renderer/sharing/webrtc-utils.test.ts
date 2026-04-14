import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptPayload } from './share-crypto.js';
import {
  decodeConnectionCode,
  encodeConnectionCode,
  sendMessage,
  waitForIceGathering,
} from './webrtc-utils.js';

describe('sendMessage', () => {
  it('serializes and sends messages only when the data channel is open', () => {
    const send = vi.fn();
    sendMessage({ readyState: 'open', send } as any, { type: 'ping' });
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    send.mockClear();
    sendMessage({ readyState: 'closing', send } as any, { type: 'pong' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('encodeConnectionCode / decodeConnectionCode', () => {
  const passphrase = 'ABCD-EF12-GH34-JK56';

  it('round-trips valid session descriptions', async () => {
    const desc = { type: 'offer', sdp: 'v=0\r\n...' } as RTCSessionDescriptionInit;
    const code = await encodeConnectionCode(desc as any, passphrase);

    await expect(decodeConnectionCode(code, 'offer', passphrase.toLowerCase())).resolves.toEqual(desc);
  });

  it('rejects malformed or mismatched connection codes', async () => {
    const malformed = await encryptPayload(JSON.stringify({ foo: 'bar' }), passphrase);
    await expect(decodeConnectionCode(malformed, 'offer', passphrase)).rejects.toThrow(/missing required fields/i);

    const answer = await encodeConnectionCode({ type: 'answer', sdp: 'v=0\r\n...' } as any, passphrase);
    await expect(decodeConnectionCode(answer, 'offer', passphrase)).rejects.toThrow(/expected offer but got answer/i);

    await expect(decodeConnectionCode('not-a-valid-code', 'offer', passphrase)).rejects.toThrow(/could not decrypt/i);
  });
});

describe('waitForIceGathering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when ICE gathering is already complete', async () => {
    const pc = {
      iceGatheringState: 'complete',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    await expect(waitForIceGathering(pc)).resolves.toBeUndefined();
    expect(pc.addEventListener).not.toHaveBeenCalled();
  });

  it('resolves when the state changes to complete', async () => {
    let listener: (() => void) | undefined;
    const pc = {
      iceGatheringState: 'gathering',
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    } as any;

    const pending = waitForIceGathering(pc);
    pc.iceGatheringState = 'complete';
    listener?.();
    await pending;

    expect(pc.removeEventListener).toHaveBeenCalled();
  });

  it('falls back to the timeout when ICE gathering stalls', async () => {
    const pc = {
      iceGatheringState: 'gathering',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    const pending = waitForIceGathering(pc);
    vi.advanceTimersByTime(10_000);
    await pending;

    expect(pc.removeEventListener).toHaveBeenCalled();
  });
});
