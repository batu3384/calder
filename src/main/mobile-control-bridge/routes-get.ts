import * as http from 'node:http';

import { getMobileCopy } from './copy';
import { sendJson, sendText } from './http';
import { renderMobilePage } from './page';
import { clearRateLimitEntriesForPairing, verifyPairingToken } from './rate-limit';
import { deletePairingRecord, getPagePairing, isExpired } from './store';

type MobileCopy = ReturnType<typeof getMobileCopy>;

function handlePairingPageRequest(
  pathname: string,
  url: URL,
  res: http.ServerResponse,
  requestCopy: MobileCopy,
): boolean {
  if (!pathname.startsWith('/m/')) {
    sendText(res, 404, requestCopy.serverMessage.routeNotFound);
    return true;
  }

  const record = getPagePairing(pathname);
  if (!record) {
    sendText(res, 404, requestCopy.serverMessage.pairingNotFound);
    return true;
  }

  const copy = getMobileCopy(record.language);
  if (isExpired(record)) {
    deletePairingRecord(record.id);
    clearRateLimitEntriesForPairing(record.id);
    sendText(res, 410, copy.serverMessage.pairingExpired);
    return true;
  }

  if (record.accessMode === 'lan' && !verifyPairingToken(record, url.searchParams.get('t'))) {
    sendText(res, 403, copy.serverMessage.invalidPairingTokenPage);
    return true;
  }

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(renderMobilePage(record.id, record.language));
  return true;
}

export function handleBridgeGetRequest(
  pathname: string,
  url: URL,
  res: http.ServerResponse,
  requestCopy: MobileCopy,
): boolean {
  if (pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  return handlePairingPageRequest(pathname, url, res, requestCopy);
}
