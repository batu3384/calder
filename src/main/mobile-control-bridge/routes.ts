import * as http from 'node:http';
import { getMobileCopy, getRequestLanguage } from './copy';
import { sendText } from './http';
import { handleBridgeGetRequest } from './routes-get';
import { dispatchPairingPostRequest } from './routes-post-dispatch';
import { createPairingPostHandlers } from './routes-post';
import type { PairingPostHandlersConfig } from './routes-post';

interface BridgeRouteConfig extends PairingPostHandlersConfig {
  cleanupBridgeRecords: () => void;
}

export function createBridgeRequestHandler(config: BridgeRouteConfig): (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => void {
  const postHandlers = createPairingPostHandlers(config);

  return function handleBridgeRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    config.cleanupBridgeRecords();

    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    const requestLanguage = getRequestLanguage(url, req);
    const requestCopy = getMobileCopy(requestLanguage);

    if (req.method === 'GET' && handleBridgeGetRequest(pathname, url, res, requestCopy)) {
      return;
    }

    if (req.method === 'POST' && dispatchPairingPostRequest(pathname, req, res, postHandlers)) {
      return;
    }

    sendText(res, 404, requestCopy.serverMessage.routeNotFound);
  };
}
