import { randomBytes } from 'node:crypto';

import { resolveShareRtcConfigFromEnv } from '../share-rtc-config';
import type { MobileUiLanguage } from './copy';
import { normalizeMobileLanguage } from './copy';
import type {
  MobileControlPairingOptions,
  PairingRecord,
} from './model';
import { normalizeShareConnectionDescription } from './security';

export const DEFAULT_TTL_MS = 5 * 60_000;

export function resolvePairingTtlMs(requestedTtl: number | undefined): number {
  return typeof requestedTtl === 'number' && Number.isFinite(requestedTtl) && requestedTtl > 0
    ? requestedTtl
    : DEFAULT_TTL_MS;
}

export function resolvePairingLanguage(input: MobileUiLanguage | undefined): MobileUiLanguage {
  return normalizeMobileLanguage(input);
}

export function createPairingRecord(
  options: MobileControlPairingOptions,
  accessMode: 'lan' | 'remote',
  language: MobileUiLanguage,
  now: number,
  ttlMs: number,
  otpCode: string,
): PairingRecord {
  const rtcConfig = resolveShareRtcConfigFromEnv();
  const offerDescription = normalizeShareConnectionDescription(options.offerDescription, 'offer');

  return {
    id: randomBytes(12).toString('hex'),
    sessionId: options.sessionId,
    offer: options.offer,
    offerDescription,
    passphrase: options.passphrase,
    mode: options.mode,
    accessMode,
    token: randomBytes(20).toString('hex'),
    otpCode,
    attempts: 0,
    otpVerified: false,
    submitToken: null,
    answer: null,
    answerConsumed: false,
    language,
    rtcConfig: {
      iceServers: rtcConfig.iceServers,
      iceTransportPolicy: rtcConfig.iceTransportPolicy,
    },
    createdAtMs: now,
    expiresAtMs: now + ttlMs,
  };
}
