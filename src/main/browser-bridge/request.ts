import type { IncomingMessage, ServerResponse } from 'node:http';

import type { EmbeddedBrowserOpenPayload } from '../../shared/types/project-core';
import { isAllowedExternalUrl } from '../browser-open-policy';

const MAX_REQUEST_BODY_LENGTH = 16_384;

function parseRequestBody(raw: string): EmbeddedBrowserOpenPayload | null {
  const params = new URLSearchParams(raw);
  const url = params.get('url')?.trim();
  const cwd = params.get('cwd')?.trim();
  const preferEmbedded = params.get('preferEmbedded') === '1';
  if (!url || !isAllowedExternalUrl(url)) return null;
  return {
    url,
    ...(cwd ? { cwd } : {}),
    ...(preferEmbedded ? { preferEmbedded: true } : {}),
  };
}

export function handleBrowserBridgeRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  token: string,
  onOpenRequest: (payload: EmbeddedBrowserOpenPayload) => Promise<void> | void,
): void {
  if (req.method !== 'POST' || req.url !== '/open') {
    res.writeHead(404).end();
    return;
  }
  if (req.headers['x-calder-token'] !== token) {
    res.writeHead(403).end();
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_REQUEST_BODY_LENGTH) {
      req.destroy(new Error('request too large'));
    }
  });
  req.on('end', async () => {
    const payload = parseRequestBody(body);
    if (!payload) {
      res.writeHead(400).end();
      return;
    }
    try {
      await onOpenRequest(payload);
      res.writeHead(204).end();
    } catch (error) {
      console.error('Calder browser bridge failed to handle open request', error);
      res.writeHead(500).end();
    }
  });
  req.on('error', () => {
    if (!res.writableEnded) res.writeHead(400).end();
  });
}
