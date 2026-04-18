// Shared WebRTC utilities for P2P session sharing.

import type { ShareMessage, ShareIceServer, ShareRtcConfig } from '../../shared/sharing-types.js';
import { encryptPayload, decryptPayload } from './share-crypto.js';

const DEFAULT_ICE_SERVERS: ShareIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

interface EncodedConnectionEnvelopeV2 {
  v: 2;
  description: RTCSessionDescriptionInit;
  rtcConfig?: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'>;
}

export interface DecodedConnectionEnvelope {
  description: RTCSessionDescriptionInit;
  rtcConfig?: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'>;
}

function normalizeIceServer(input: unknown): ShareIceServer | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as {
    urls?: unknown;
    username?: unknown;
    credential?: unknown;
  };

  let urls: string | string[] | null = null;
  if (typeof candidate.urls === 'string' && candidate.urls.trim().length > 0) {
    urls = candidate.urls.trim();
  } else if (Array.isArray(candidate.urls)) {
    const normalizedUrls = candidate.urls
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (normalizedUrls.length > 0) urls = normalizedUrls;
  }

  if (!urls) return null;
  const normalized: ShareIceServer = { urls };
  if (typeof candidate.username === 'string' && candidate.username.trim().length > 0) {
    normalized.username = candidate.username.trim();
  }
  if (typeof candidate.credential === 'string' && candidate.credential.trim().length > 0) {
    normalized.credential = candidate.credential.trim();
  }
  return normalized;
}

function normalizeShareRtcConfig(
  config?: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'> | null,
): Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'> {
  const normalizedServers = (config?.iceServers ?? [])
    .map((entry) => normalizeIceServer(entry))
    .filter((entry): entry is ShareIceServer => Boolean(entry));

  return {
    iceServers: normalizedServers.length > 0 ? normalizedServers : DEFAULT_ICE_SERVERS,
    iceTransportPolicy: config?.iceTransportPolicy === 'relay' ? 'relay' : 'all',
  };
}

export function buildRtcConfiguration(
  config?: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'> | null,
): RTCConfiguration {
  const normalized = normalizeShareRtcConfig(config);
  return {
    iceServers: normalized.iceServers,
    iceTransportPolicy: normalized.iceTransportPolicy,
  };
}

function getDescriptionFromPayload(payload: unknown): DecodedConnectionEnvelope {
  if (
    payload
    && typeof payload === 'object'
    && 'v' in payload
    && (payload as Record<string, unknown>).v === 2
    && 'description' in payload
  ) {
    const envelope = payload as EncodedConnectionEnvelopeV2;
    return {
      description: envelope.description,
      rtcConfig: envelope.rtcConfig,
    };
  }

  return {
    description: payload as RTCSessionDescriptionInit,
  };
}

export function sendMessage(dc: RTCDataChannel, msg: ShareMessage): void {
  if (dc.readyState === 'open') {
    dc.send(JSON.stringify(msg));
  }
}

export async function encodeConnectionCode(
  desc: RTCSessionDescription | RTCSessionDescriptionInit | null,
  passphrase: string,
  rtcConfig?: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'>,
): Promise<string> {
  const description = desc as RTCSessionDescriptionInit | null;
  if (description?.type === 'offer' && rtcConfig) {
    const normalizedConfig = normalizeShareRtcConfig(rtcConfig);
    const envelope: EncodedConnectionEnvelopeV2 = {
      v: 2,
      description,
      rtcConfig: normalizedConfig,
    };
    return encryptPayload(JSON.stringify(envelope), passphrase);
  }
  return encryptPayload(JSON.stringify(description), passphrase);
}

export async function decodeConnectionEnvelope(
  code: string,
  expectedType: 'offer' | 'answer' | undefined,
  passphrase: string,
): Promise<DecodedConnectionEnvelope> {
  let decoded: string;
  try {
    decoded = await decryptPayload(code, passphrase);
  } catch {
    throw new Error('Invalid connection code: could not decrypt (wrong passphrase?)');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid connection code: malformed data');
  }

  const parsedEnvelope = getDescriptionFromPayload(parsed);
  const desc = parsedEnvelope.description;

  if (
    typeof desc !== 'object'
    || desc === null
    || typeof desc.type !== 'string'
    || typeof desc.sdp !== 'string'
  ) {
    throw new Error('Invalid connection code: missing required fields');
  }

  if (desc.type !== 'offer' && desc.type !== 'answer') {
    throw new Error('Invalid connection code: unexpected type');
  }

  if (expectedType && desc.type !== expectedType) {
    throw new Error(`Invalid connection code: expected ${expectedType} but got ${desc.type}`);
  }

  return {
    description: desc,
    rtcConfig: parsedEnvelope.rtcConfig ? normalizeShareRtcConfig(parsedEnvelope.rtcConfig) : undefined,
  };
}

export async function decodeConnectionCode(
  code: string,
  expectedType: 'offer' | 'answer' | undefined,
  passphrase: string,
): Promise<RTCSessionDescriptionInit> {
  const decoded = await decodeConnectionEnvelope(code, expectedType, passphrase);
  return decoded.description;
}

export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    // Timeout after 10s in case ICE gathering stalls
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, 10_000);
  });
}
