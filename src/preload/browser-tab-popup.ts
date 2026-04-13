import type { BrowserGuestOpenPayload } from '../shared/types.js';

const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'file:']);

export function resolveBrowserGuestOpenPayload(
  requestedUrl: string,
  baseUrl: string,
  source: BrowserGuestOpenPayload['source'],
): BrowserGuestOpenPayload | null {
  const trimmed = requestedUrl.trim();
  if (!trimmed) return null;

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (BLOCKED_PROTOCOLS.has(resolved.protocol)) {
      return null;
    }
    return {
      url: resolved.href,
      source,
    };
  } catch {
    return null;
  }
}
