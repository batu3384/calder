import * as http from 'node:http';
import { randomBytes } from 'node:crypto';
import { getMobileCopy } from './copy';
import { sendJson, sendText } from './http';
import type { PairingRecord } from './model';
import { verifyPairingToken } from './rate-limit';
import {
  failExpiredPairing,
  failRateLimited,
  parsePairingBody,
} from './routes-post-shared';
import type { PairingPostHandlersConfig } from './routes-post-shared';

export function createBootstrapPostHandler(config: PairingPostHandlersConfig): (
  record: PairingRecord,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void> {
  return async function handleBootstrapRequest(
    record: PairingRecord,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const copy = getMobileCopy(record.language);
    if (failExpiredPairing(record, res)) return;
    if (failRateLimited(record, req, res, 'bootstrap', config.rateLimit, copy.serverMessage.tooManyPairingAttempts)) return;

    const body = await parsePairingBody<{ token?: unknown; otp?: unknown }>(record, req, res, config.maxBodyBytes);
    if (!body) return;
    if (!verifyPairingToken(record, body.token)) {
      sendText(res, 403, copy.serverMessage.pairingTokenInvalid);
      return;
    }
    if (record.attempts >= config.maxOtpAttempts) {
      sendText(res, 429, copy.serverMessage.tooManyOtpAttempts);
      return;
    }
    if (typeof body.otp !== 'string' || body.otp.trim() !== record.otpCode) {
      record.attempts += 1;
      sendText(res, 401, copy.serverMessage.otpMismatch);
      return;
    }

    record.otpVerified = true;
    if (!record.submitToken) {
      record.submitToken = randomBytes(18).toString('hex');
    }

    sendJson(res, 200, {
      offer: record.offer,
      offerDescription: record.offerDescription,
      passphrase: record.passphrase,
      mode: record.mode,
      submitToken: record.submitToken,
      iceServers: record.rtcConfig.iceServers,
      iceTransportPolicy: record.rtcConfig.iceTransportPolicy,
      expiresAt: new Date(record.expiresAtMs).toISOString(),
    });
  };
}
