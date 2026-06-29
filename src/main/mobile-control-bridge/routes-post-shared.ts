import * as http from 'node:http';

import { getMobileCopy } from './copy';
import { readBody, sendText } from './http';
import type { PairingRecord } from './model';
import type { PairingRateLimitConfig } from './rate-limit';
import { clearRateLimitEntriesForPairing, isRateLimited } from './rate-limit';
import { deletePairingRecord, isExpired } from './store';

export interface PairingPostHandlersConfig {
  maxBodyBytes: number;
  maxOtpAttempts: number;
  rateLimit: PairingRateLimitConfig;
}

export function failExpiredPairing(record: PairingRecord, res: http.ServerResponse): boolean {
  if (!isExpired(record)) return false;
  const copy = getMobileCopy(record.language);
  deletePairingRecord(record.id);
  clearRateLimitEntriesForPairing(record.id);
  sendText(res, 410, copy.serverMessage.pairingExpired);
  return true;
}

export function failRateLimited(
  record: PairingRecord,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  scope: 'bootstrap' | 'answer' | 'challenge',
  rateLimit: PairingRateLimitConfig,
  message: string,
): boolean {
  if (!isRateLimited(req, record.id, scope, rateLimit)) return false;
  sendText(res, 429, message);
  return true;
}

export async function parsePairingBody<T>(
  record: PairingRecord,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maxBodyBytes: number,
): Promise<T | null> {
  const copy = getMobileCopy(record.language);
  try {
    return JSON.parse(await readBody(req, maxBodyBytes)) as T;
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') {
      sendText(res, 413, copy.serverMessage.requestBodyTooLarge);
      return null;
    }
    sendText(res, 400, copy.serverMessage.invalidJsonPayload);
    return null;
  }
}
