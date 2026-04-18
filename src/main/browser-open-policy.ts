import type { EmbeddedBrowserOpenPayload } from '../shared/types';

interface BrowserWindowLike {
  isDestroyed?(): boolean;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
  };
}

const EMBEDDED_BROWSER_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

export function isEmbeddedBrowserCandidate(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return EMBEDDED_BROWSER_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function openUrlWithBrowserPolicy(
  payload: string | EmbeddedBrowserOpenPayload,
  mainWindow: BrowserWindowLike | null | undefined,
  openExternal: (target: string) => Promise<void> | void,
): Promise<'embedded' | 'external'> {
  const normalizedPayload = typeof payload === 'string'
    ? { url: payload }
    : payload;
  const shouldEmbed = normalizedPayload.preferEmbedded
    ? isHttpUrl(normalizedPayload.url)
    : isEmbeddedBrowserCandidate(normalizedPayload.url);

  if (shouldEmbed && mainWindow && !(mainWindow.isDestroyed?.() ?? false)) {
    mainWindow.webContents.send('app:openEmbeddedBrowserUrl', normalizedPayload);
    return 'embedded';
  }

  await openExternal(normalizedPayload.url);
  return 'external';
}
