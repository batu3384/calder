export interface ParsedPairingLink {
  origin: string;
  pairingId: string;
  token: string;
}

export interface BootstrapSuccess {
  ok: true;
  response: unknown;
}

export interface BootstrapFailure {
  ok: false;
  error: string;
}

export type BootstrapResult = BootstrapSuccess | BootstrapFailure;

function readTokenFromHash(hash: string): string {
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(cleanHash);
  return params.get('t') ?? '';
}

function parseRawPairingUrl(rawLink: string): URL | null {
  const link = rawLink.trim();
  if (!link) return null;
  try {
    return new URL(link);
  } catch {
    return null;
  }
}

export function normalizePairingUrl(rawLink: string): string | null {
  const url = parseRawPairingUrl(rawLink);
  if (!url) return null;

  const match = url.pathname.match(/\/m\/([^/]+)$/u);
  if (!match) return null;

  const pairingId = match[1]?.trim() ?? '';
  if (!pairingId) return null;

  const token = url.searchParams.get('t') ?? readTokenFromHash(url.hash);
  if (!token) return null;

  const normalized = new URL(`${url.protocol}//${url.host}/m/${pairingId}`);
  normalized.searchParams.set('t', token);

  const language = url.searchParams.get('lang');
  if (language === 'tr' || language === 'en') {
    normalized.searchParams.set('lang', language);
  }

  return normalized.toString();
}

export function parsePairingLink(rawLink: string): ParsedPairingLink | null {
  const normalizedUrl = normalizePairingUrl(rawLink);
  if (!normalizedUrl) return null;
  const url = new URL(normalizedUrl);
  const match = url.pathname.match(/\/m\/([^/]+)$/u);
  const pairingId = match?.[1]?.trim() ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!pairingId || !token) return null;

  return {
    origin: `${url.protocol}//${url.host}`,
    pairingId,
    token,
  };
}

export async function bootstrapPairing(pairingLink: string, otpCode: string): Promise<BootstrapResult> {
  const parsed = parsePairingLink(pairingLink);
  if (!parsed) {
    return {
      ok: false,
      error: 'Pairing link is invalid.',
    };
  }

  const otp = otpCode.replace(/\s+/gu, '').trim();
  if (otp.length !== 6) {
    return {
      ok: false,
      error: 'OTP must be 6 digits.',
    };
  }

  const endpoint = `${parsed.origin}/api/pair/${parsed.pairingId}/bootstrap`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: parsed.token,
        otp,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error.',
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error ?? 'Bootstrap failed.')
      : 'Bootstrap failed.';
    return {
      ok: false,
      error: errorMessage,
    };
  }

  return {
    ok: true,
    response: payload,
  };
}
