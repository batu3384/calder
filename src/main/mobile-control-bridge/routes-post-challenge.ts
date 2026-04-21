import * as http from 'node:http';
import { getMobileCopy } from './copy';
import { sendJson, sendText } from './http';
import type { PairingRecord } from './model';
import { verifyPairingToken } from './rate-limit';
import { computeShareChallengeResponse, isEncryptedChallengePayload } from './security';
import {
  failExpiredPairing,
  failRateLimited,
  parsePairingBody,
} from './routes-post-shared';
import type { PairingPostHandlersConfig } from './routes-post-shared';

export function createChallengePostHandler(config: PairingPostHandlersConfig): (
  record: PairingRecord,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void> {
  return async function handleChallengeRequest(
    record: PairingRecord,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const copy = getMobileCopy(record.language);
    if (failExpiredPairing(record, res)) return;
    if (failRateLimited(record, req, res, 'challenge', config.rateLimit, copy.serverMessage.tooManyChallengeRequests)) return;

    const body = await parsePairingBody<{ token?: unknown; challenge?: unknown }>(record, req, res, config.maxBodyBytes);
    if (!body) return;
    if (!verifyPairingToken(record, body.token)) {
      sendText(res, 403, copy.serverMessage.pairingTokenInvalid);
      return;
    }
    if (!record.otpVerified) {
      sendText(res, 403, copy.serverMessage.otpRequiredFirst);
      return;
    }
    if (typeof body.challenge !== 'string' || body.challenge.trim().length === 0) {
      sendText(res, 400, copy.serverMessage.missingChallengePayload);
      return;
    }

    const challenge = body.challenge.trim();
    if (!isEncryptedChallengePayload(challenge)) {
      sendText(res, 400, copy.serverMessage.invalidChallengePayload);
      return;
    }

    const response = computeShareChallengeResponse(challenge, record.passphrase);
    sendJson(res, 200, { response });
  };
}
