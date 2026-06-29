import { randomInt } from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
  MobileBridgeState,
  MobileControlAnswerResult,
  MobileControlPairingOptions,
  MobileControlPairingResult,
} from './mobile-control-bridge/model';
import {
  buildPairingUrl,
  isInvalidIpv4HostAddress,
  isPrivateIpv4,
  listLanHosts,
  parseIpv4ToInt,
  resolveMobilePublicBaseUrl,
} from './mobile-control-bridge/network';
import {
  createPairingRecord,
  resolvePairingLanguage,
  resolvePairingTtlMs,
} from './mobile-control-bridge/pairing-record';
import { createLocalPairingUrls } from './mobile-control-bridge/pairing-url-local';
import {
  cleanupExpiredRateLimitEntries,
  clearAllRateLimits,
  clearRateLimitEntriesForPairing,
} from './mobile-control-bridge/rate-limit';
import { createBridgeRequestHandler } from './mobile-control-bridge/routes';
import {
  cleanupExpiredPairings,
  clearPairingStore,
  consumePairingAnswer,
  deletePairingRecord,
  setPairingRecord,
} from './mobile-control-bridge/store';

const MAX_OTP_ATTEMPTS = 5;
const MAX_BODY_BYTES = 32 * 1024;
const CLEANUP_INTERVAL_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_BLOCK_MS = 20_000;

let bridgeState: MobileBridgeState | null = null;

function cleanupBridgeRecords(): void {
  cleanupExpiredPairings(clearRateLimitEntriesForPairing);
  cleanupExpiredRateLimitEntries(RATE_LIMIT_WINDOW_MS);
}

function createOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const handleBridgeRequest = createBridgeRequestHandler({
  cleanupBridgeRecords,
  maxBodyBytes: MAX_BODY_BYTES,
  maxOtpAttempts: MAX_OTP_ATTEMPTS,
  rateLimit: {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    blockMs: RATE_LIMIT_BLOCK_MS,
  },
});

async function ensureBridgeStarted(): Promise<MobileBridgeState> {
  if (bridgeState) return bridgeState;

  const hosts = listLanHosts();
  const host = hosts[0] ?? '127.0.0.1';
  const server = http.createServer((req, res) => handleBridgeRequest(req, res));
  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const value = server.address();
      if (!value || typeof value === 'string') {
        reject(new Error('Mobile control bridge failed to bind port.'));
        return;
      }
      resolve(value);
    });
  });

  const cleanupTimer = setInterval(cleanupBridgeRecords, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  bridgeState = {
    server,
    port: address.port,
    host,
    hosts,
    cleanupTimer,
  };
  return bridgeState;
}

export async function createMobileControlPairing(
  options: MobileControlPairingOptions,
): Promise<MobileControlPairingResult> {
  const state = await ensureBridgeStarted();
  cleanupBridgeRecords();
  const publicBaseUrl = resolveMobilePublicBaseUrl();
  const accessMode: 'lan' | 'remote' = publicBaseUrl ? 'remote' : 'lan';

  const now = Date.now();
  const ttlMs = resolvePairingTtlMs(options.ttlMs);
  const language = resolvePairingLanguage(options.language);
  const record = createPairingRecord(options, accessMode, language, now, ttlMs, createOtpCode());
  setPairingRecord(record);

  const { localPairingUrl, localPairingUrls } = createLocalPairingUrls(
    [state.host, ...state.hosts],
    state.port,
    record.id,
    record.token,
    record.language,
  );
  const pairingUrl = publicBaseUrl
    ? buildPairingUrl(publicBaseUrl, record.id, record.token, 'fragment', true, record.language)
    : localPairingUrl;

  return {
    pairingId: record.id,
    pairingUrl,
    localPairingUrl,
    localPairingUrls,
    accessMode,
    otpCode: record.otpCode,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  };
}

export function consumeMobileControlPairingAnswer(pairingId: string): MobileControlAnswerResult {
  return consumePairingAnswer(pairingId, clearRateLimitEntriesForPairing);
}

export function revokeMobileControlPairing(pairingId: string): void {
  deletePairingRecord(pairingId);
  clearRateLimitEntriesForPairing(pairingId);
}

export async function stopMobileControlBridge(): Promise<void> {
  if (!bridgeState) return;
  const current = bridgeState;
  bridgeState = null;
  clearInterval(current.cleanupTimer);
  clearPairingStore();
  clearAllRateLimits();
  await new Promise<void>((resolve) => current.server.close(() => resolve()));
}

export const _internal = {
  isPrivateIpv4,
  parseIpv4ToInt,
  isInvalidIpv4HostAddress,
  listLanHosts,
};
