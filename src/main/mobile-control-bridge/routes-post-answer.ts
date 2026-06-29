import * as http from 'node:http';

import { getMobileCopy } from './copy';
import { sendText } from './http';
import type { PairingRecord } from './model';
import { safeCompareToken, verifyPairingToken } from './rate-limit';
import type { PairingPostHandlersConfig } from './routes-post-shared';
import { failExpiredPairing, failRateLimited, parsePairingBody } from './routes-post-shared';
import {
  decodeShareConnectionCode,
  encodeShareConnectionDescription,
  normalizeShareConnectionDescription,
} from './security';

export function createAnswerPostHandler(
  config: PairingPostHandlersConfig,
): (record: PairingRecord, req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async function handleAnswerRequest(
    record: PairingRecord,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const copy = getMobileCopy(record.language);
    if (failExpiredPairing(record, res)) return;
    if (
      failRateLimited(
        record,
        req,
        res,
        'answer',
        config.rateLimit,
        copy.serverMessage.tooManyAnswerSubmissions,
      )
    )
      return;

    const body = await parsePairingBody<{
      token?: unknown;
      submitToken?: unknown;
      answer?: unknown;
      answerDescription?: unknown;
    }>(record, req, res, config.maxBodyBytes);
    if (!body) return;
    if (!verifyPairingToken(record, body.token)) {
      sendText(res, 403, copy.serverMessage.pairingTokenInvalid);
      return;
    }
    if (!record.otpVerified) {
      sendText(res, 403, copy.serverMessage.otpRequiredFirst);
      return;
    }
    if (record.answer) {
      sendText(res, 409, copy.serverMessage.answerAlreadySubmitted);
      return;
    }
    if (
      typeof body.submitToken !== 'string' ||
      !record.submitToken ||
      !safeCompareToken(record.submitToken, body.submitToken)
    ) {
      sendText(res, 403, copy.serverMessage.submitTokenInvalid);
      return;
    }

    let answerCode: string | null = null;
    if (typeof body.answer === 'string' && body.answer.trim().length > 0) {
      const candidate = body.answer.trim();
      try {
        decodeShareConnectionCode(candidate, record.passphrase, 'answer');
        answerCode = candidate;
      } catch {
        sendText(res, 400, copy.serverMessage.invalidAnswerPayload);
        return;
      }
    } else {
      const answerDescription = normalizeShareConnectionDescription(
        body.answerDescription,
        'answer',
      );
      if (answerDescription) {
        answerCode = encodeShareConnectionDescription(answerDescription, record.passphrase);
      }
    }
    if (!answerCode) {
      sendText(res, 400, copy.serverMessage.missingAnswerPayload);
      return;
    }

    record.answer = answerCode;
    record.submitToken = null;
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
  };
}
