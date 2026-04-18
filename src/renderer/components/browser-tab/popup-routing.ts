import type { BrowserGuestOpenPayload } from '../../../shared/types.js';

interface BrowserGuestOpenRoutingHandlers {
  openEmbedded: (url: string) => void;
  openExternal: (url: string) => Promise<void> | void;
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

function isGuestNavigableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function handleBrowserGuestOpenRequest(
  payload: BrowserGuestOpenPayload,
  handlers: BrowserGuestOpenRoutingHandlers,
): Promise<'embedded' | 'external' | 'ignored'> {
  if (!payload?.url) return 'ignored';

  if (isGuestNavigableUrl(payload.url)) {
    handlers.openEmbedded(payload.url);
    return 'embedded';
  }

  if (!isAllowedExternalUrl(payload.url)) {
    return 'ignored';
  }

  await handlers.openExternal(payload.url);
  return 'external';
}
