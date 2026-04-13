import type { BrowserGuestOpenPayload } from '../../../shared/types.js';

interface BrowserGuestOpenRoutingHandlers {
  openEmbedded: (url: string) => void;
  openExternal: (url: string) => Promise<void> | void;
}

function isGuestNavigableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
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

  try {
    new URL(payload.url);
  } catch {
    return 'ignored';
  }

  await handlers.openExternal(payload.url);
  return 'external';
}
