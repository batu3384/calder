export type BrowserTrustZoneId = 'local' | 'remote' | 'file' | 'unknown';
export type BrowserTrustZoneAccess = 'trusted' | 'restricted' | 'unknown';

export interface BrowserTrustZone {
  id: BrowserTrustZoneId;
  access: BrowserTrustZoneAccess;
  label: string;
  title: string;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_HOST_PORT = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i;

const TRUST_ZONES: Record<BrowserTrustZoneId, BrowserTrustZone> = {
  local: {
    id: 'local',
    access: 'trusted',
    label: 'Local',
    title: 'Trusted local browser surface. Runtime permissions are unchanged.',
  },
  remote: {
    id: 'remote',
    access: 'restricted',
    label: 'Remote',
    title: 'Restricted remote page. Runtime permissions are unchanged.',
  },
  file: {
    id: 'file',
    access: 'restricted',
    label: 'File',
    title: 'Restricted file page. Runtime permissions are unchanged.',
  },
  unknown: {
    id: 'unknown',
    access: 'unknown',
    label: 'Unknown',
    title: 'Unknown browser surface. Runtime permissions are unchanged.',
  },
};

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

export function classifyBrowserTrustZone(value: string | undefined | null): BrowserTrustZone {
  const candidate = value?.trim();
  if (!candidate || candidate === 'about:blank') return TRUST_ZONES.unknown;
  const parseableCandidate =
    HAS_SCHEME.test(candidate) && !BARE_HOST_PORT.test(candidate)
      ? candidate
      : `http://${candidate}`;

  try {
    const parsed = new URL(parseableCandidate);
    if (parsed.protocol === 'file:') return TRUST_ZONES.file;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return isLocalHostname(parsed.hostname) ? TRUST_ZONES.local : TRUST_ZONES.remote;
    }
  } catch {
    return TRUST_ZONES.unknown;
  }

  return TRUST_ZONES.unknown;
}

export function syncBrowserTrustZoneBadge(
  badge: HTMLSpanElement,
  value: string | undefined | null,
): BrowserTrustZone {
  const zone = classifyBrowserTrustZone(value);
  badge.dataset.zone = zone.id;
  badge.dataset.access = zone.access;
  badge.textContent = zone.label;
  badge.title = zone.title;
  badge.setAttribute('aria-label', `${zone.label} trust zone: ${zone.access}`);
  return zone;
}
