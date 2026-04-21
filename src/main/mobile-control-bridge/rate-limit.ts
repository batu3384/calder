import * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { PairingRecord } from './model';

const requestRateLimits = new Map<string, { windowStartMs: number; count: number; blockedUntilMs: number }>();

export interface PairingRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockMs: number;
}

export function clearRateLimitEntriesForPairing(pairingId: string): void {
  const token = `:${pairingId}:`;
  for (const key of requestRateLimits.keys()) {
    if (key.includes(token)) {
      requestRateLimits.delete(key);
    }
  }
}

export function safeCompareToken(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function verifyPairingToken(record: PairingRecord, token: unknown): boolean {
  return safeCompareToken(record.token, token);
}

function getRequestClientAddress(req: http.IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

export function isRateLimited(
  req: http.IncomingMessage,
  pairingId: string,
  scope: 'bootstrap' | 'answer' | 'challenge',
  config: PairingRateLimitConfig,
): boolean {
  const now = Date.now();
  const key = `${scope}:${pairingId}:${getRequestClientAddress(req)}`;
  const existing = requestRateLimits.get(key);
  if (!existing) {
    requestRateLimits.set(key, { windowStartMs: now, count: 1, blockedUntilMs: 0 });
    return false;
  }

  if (existing.blockedUntilMs > now) {
    return true;
  }

  if (now - existing.windowStartMs > config.windowMs) {
    existing.windowStartMs = now;
    existing.count = 1;
    return false;
  }

  existing.count += 1;
  if (existing.count > config.maxRequests) {
    existing.blockedUntilMs = now + config.blockMs;
    return true;
  }
  return false;
}

export function cleanupExpiredRateLimitEntries(windowMs: number): void {
  const now = Date.now();
  for (const [key, value] of requestRateLimits) {
    if (value.blockedUntilMs < now && now - value.windowStartMs > windowMs * 2) {
      requestRateLimits.delete(key);
    }
  }
}

export function clearAllRateLimits(): void {
  requestRateLimits.clear();
}
