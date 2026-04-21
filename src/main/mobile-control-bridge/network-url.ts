import type { MobileUiLanguage } from './copy';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveMobilePublicBaseUrl(env: NodeJS.ProcessEnv = process.env): URL | null {
  const raw = env.CALDER_MOBILE_PUBLIC_BASE_URL;
  if (!isNonEmptyString(raw)) return null;

  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because protocol is not http/https.');
      return null;
    }
    if (parsed.username || parsed.password) {
      console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because credentials are not allowed.');
      return null;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed;
  } catch {
    console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because value is not a valid URL.');
    return null;
  }
}

export function buildPairingUrl(
  baseUrl: URL,
  pairingId: string,
  token: string,
  tokenTransport: 'query' | 'fragment' = 'query',
  includeQueryFallbackToken: boolean = false,
  language: MobileUiLanguage = 'en',
): string {
  const normalizedBaseUrl = new URL(baseUrl.toString());
  if (!normalizedBaseUrl.pathname.endsWith('/')) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }
  const pairingPageUrl = new URL(`m/${pairingId}`, normalizedBaseUrl);
  if (language === 'tr') {
    pairingPageUrl.searchParams.set('lang', 'tr');
  }
  if (tokenTransport === 'query') {
    pairingPageUrl.searchParams.set('t', token);
  } else {
    if (includeQueryFallbackToken) {
      pairingPageUrl.searchParams.set('t', token);
    }
    const hashParams = new URLSearchParams();
    hashParams.set('t', token);
    pairingPageUrl.hash = hashParams.toString();
  }
  return pairingPageUrl.toString();
}
