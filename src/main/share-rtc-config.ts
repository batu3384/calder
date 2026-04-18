import type { ShareIceServer, ShareRtcConfig } from '../shared/sharing-types';

const DEFAULT_ICE_SERVERS: ShareIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeIceServer(input: unknown): ShareIceServer | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as {
    urls?: unknown;
    username?: unknown;
    credential?: unknown;
  };

  let urls: string | string[] | null = null;
  if (isNonEmptyString(candidate.urls)) {
    urls = candidate.urls.trim();
  } else if (Array.isArray(candidate.urls)) {
    const normalizedUrls = candidate.urls
      .filter((entry): entry is string => isNonEmptyString(entry))
      .map((entry) => entry.trim());
    if (normalizedUrls.length > 0) urls = normalizedUrls;
  }
  if (!urls) return null;

  const normalized: ShareIceServer = { urls };
  if (isNonEmptyString(candidate.username)) normalized.username = candidate.username.trim();
  if (isNonEmptyString(candidate.credential)) normalized.credential = candidate.credential.trim();
  return normalized;
}

function parseIceServersFromJson(raw: string, issues: string[]): ShareIceServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    issues.push('CALDER_SHARE_ICE_SERVERS JSON is invalid. Falling back to default STUN server.');
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const normalized = list
    .map((entry) => normalizeIceServer(entry))
    .filter((entry): entry is ShareIceServer => Boolean(entry));

  if (normalized.length === 0) {
    issues.push('CALDER_SHARE_ICE_SERVERS did not contain valid ICE server entries. Falling back to default STUN server.');
  }
  return normalized;
}

function parseIceServersFromCsv(raw: string, issues: string[]): ShareIceServer[] {
  const urls = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (urls.length === 0) {
    issues.push('CALDER_SHARE_ICE_SERVERS is empty. Falling back to default STUN server.');
    return [];
  }

  return urls.map((url) => ({ urls: url }));
}

function parseIceServers(raw: string | undefined, issues: string[]): ShareIceServer[] {
  if (!isNonEmptyString(raw)) return DEFAULT_ICE_SERVERS;
  const trimmed = raw.trim();
  const parsed = trimmed.startsWith('[') || trimmed.startsWith('{')
    ? parseIceServersFromJson(trimmed, issues)
    : parseIceServersFromCsv(trimmed, issues);
  return parsed.length > 0 ? parsed : DEFAULT_ICE_SERVERS;
}

function parseIceTransportPolicy(raw: string | undefined, issues: string[]): 'all' | 'relay' | undefined {
  if (!isNonEmptyString(raw)) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'relay') return normalized;
  issues.push(`CALDER_SHARE_ICE_POLICY value "${raw}" is invalid. Allowed values are "all" or "relay".`);
  return undefined;
}

export function resolveShareRtcConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ShareRtcConfig {
  const issues: string[] = [];
  const iceServers = parseIceServers(env.CALDER_SHARE_ICE_SERVERS, issues);
  const iceTransportPolicy = parseIceTransportPolicy(env.CALDER_SHARE_ICE_POLICY, issues);

  const hasEnvOverrides = isNonEmptyString(env.CALDER_SHARE_ICE_SERVERS)
    || isNonEmptyString(env.CALDER_SHARE_ICE_POLICY);

  return {
    iceServers,
    iceTransportPolicy,
    source: hasEnvOverrides ? 'env' : 'default',
    issues,
  };
}

