import { describe, expect, it } from 'vitest';
import { resolveShareRtcConfigFromEnv } from './share-rtc-config';

describe('share-rtc-config', () => {
  it('returns default STUN config when no env overrides are provided', () => {
    const config = resolveShareRtcConfigFromEnv({});
    expect(config.source).toBe('default');
    expect(config.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(config.issues).toEqual([]);
  });

  it('parses comma-separated ice server urls from env', () => {
    const config = resolveShareRtcConfigFromEnv({
      CALDER_SHARE_ICE_SERVERS: 'stun:stun1.example.com:3478,turn:turn.example.com:3478',
    });
    expect(config.source).toBe('env');
    expect(config.iceServers).toEqual([
      { urls: 'stun:stun1.example.com:3478' },
      { urls: 'turn:turn.example.com:3478' },
    ]);
  });

  it('parses JSON ice servers and relay transport policy', () => {
    const config = resolveShareRtcConfigFromEnv({
      CALDER_SHARE_ICE_SERVERS: JSON.stringify([
        {
          urls: ['stun:stun1.example.com:3478', 'turn:turn.example.com:3478'],
          username: 'calder',
          credential: 'secret',
        },
      ]),
      CALDER_SHARE_ICE_POLICY: 'relay',
    });

    expect(config.iceServers).toEqual([
      {
        urls: ['stun:stun1.example.com:3478', 'turn:turn.example.com:3478'],
        username: 'calder',
        credential: 'secret',
      },
    ]);
    expect(config.iceTransportPolicy).toBe('relay');
    expect(config.issues).toEqual([]);
  });

  it('falls back to default STUN server when env values are invalid', () => {
    const config = resolveShareRtcConfigFromEnv({
      CALDER_SHARE_ICE_SERVERS: '{invalid json',
      CALDER_SHARE_ICE_POLICY: 'force-relay',
    });

    expect(config.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(config.iceTransportPolicy).toBeUndefined();
    expect(config.issues.length).toBeGreaterThan(0);
  });
});

