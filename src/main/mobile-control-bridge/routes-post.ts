import type * as http from 'node:http';

import type { PairingRecord } from './model';
import { createAnswerPostHandler } from './routes-post-answer';
import { createBootstrapPostHandler } from './routes-post-bootstrap';
import { createChallengePostHandler } from './routes-post-challenge';
import type { PairingPostHandlersConfig } from './routes-post-shared';

export type { PairingPostHandlersConfig } from './routes-post-shared';

export function createPairingPostHandlers(config: PairingPostHandlersConfig): {
  handleBootstrapRequest: (
    record: PairingRecord,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<void>;
  handleAnswerRequest: (
    record: PairingRecord,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<void>;
  handleChallengeRequest: (
    record: PairingRecord,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<void>;
} {
  return {
    handleBootstrapRequest: createBootstrapPostHandler(config),
    handleAnswerRequest: createAnswerPostHandler(config),
    handleChallengeRequest: createChallengePostHandler(config),
  };
}
