import * as http from 'node:http';

import { getPairingFromPath } from './store';

export interface PairingPostHandlers {
  handleBootstrapRequest: (record: NonNullable<ReturnType<typeof getPairingFromPath>>, req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
  handleChallengeRequest: (record: NonNullable<ReturnType<typeof getPairingFromPath>>, req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
  handleAnswerRequest: (record: NonNullable<ReturnType<typeof getPairingFromPath>>, req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
}

export function dispatchPairingPostRequest(
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  postHandlers: PairingPostHandlers,
): boolean {
  const bootstrapRecord = getPairingFromPath(pathname, '/bootstrap');
  if (bootstrapRecord) {
    void postHandlers.handleBootstrapRequest(bootstrapRecord, req, res);
    return true;
  }

  const challengeRecord = getPairingFromPath(pathname, '/challenge');
  if (challengeRecord) {
    void postHandlers.handleChallengeRequest(challengeRecord, req, res);
    return true;
  }

  const answerRecord = getPairingFromPath(pathname, '/answer');
  if (answerRecord) {
    void postHandlers.handleAnswerRequest(answerRecord, req, res);
    return true;
  }

  return false;
}
