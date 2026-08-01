import type {
  CliProviderCapabilities,
  CliProviderMeta,
  ProviderId,
} from '../shared/types/provider.js';

export interface ProviderAvailabilitySnapshot {
  providers: CliProviderMeta[];
  availability: Map<ProviderId, boolean>;
}

const DEFAULT_PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  antigravity: 'Antigravity CLI',
  cursor: 'Cursor CLI',
};

let cachedProviders: CliProviderMeta[] | null = null;
let cachedAvailability: Map<ProviderId, boolean> | null = null;

export async function loadProviderMetas(): Promise<void> {
  if (!cachedProviders) {
    cachedProviders = await window.calder.provider.listProviders();
  }
}

export async function loadProviderAvailability(): Promise<void> {
  await loadProviderMetas();
  const providers = cachedProviders ?? [];
  const checks = await Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      ok: (await window.calder.provider.checkBinary(p.id)).ok,
    })),
  );
  cachedAvailability = new Map(checks.map((c) => [c.id, c.ok]));
}

export function hasMultipleAvailableProviders(): boolean {
  if (!cachedAvailability) return false;
  let count = 0;
  for (const ok of cachedAvailability.values()) {
    if (ok) count++;
    if (count > 1) return true;
  }
  return false;
}

export function getProviderAvailabilitySnapshot(): ProviderAvailabilitySnapshot | null {
  if (!cachedProviders || !cachedAvailability) return null;
  return {
    providers: cachedProviders,
    availability: cachedAvailability,
  };
}

export function shouldRenderInlineProviderSelector(
  snapshot: ProviderAvailabilitySnapshot | null,
): boolean {
  if (!snapshot) return false;
  let count = 0;
  for (const provider of snapshot.providers) {
    if (snapshot.availability.get(provider.id)) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

export function resolvePreferredProviderForLaunch(
  preferredProvider: ProviderId | undefined,
  snapshot: ProviderAvailabilitySnapshot | null,
): ProviderId {
  if (!snapshot) return preferredProvider ?? 'claude';

  if (preferredProvider && snapshot.availability.get(preferredProvider)) {
    return preferredProvider;
  }

  return (
    snapshot.providers.find((provider) => snapshot.availability.get(provider.id))?.id ??
    preferredProvider ??
    snapshot.providers[0]?.id ??
    'claude'
  );
}

export function resolveProviderForCheck(
  preferredProvider: ProviderId | undefined,
  candidateProviderIds: ProviderId[] | undefined,
  snapshot: ProviderAvailabilitySnapshot | null,
): ProviderId {
  if (!candidateProviderIds || candidateProviderIds.length === 0) {
    return resolvePreferredProviderForLaunch(preferredProvider, snapshot);
  }

  if (!snapshot) {
    return candidateProviderIds[0];
  }

  if (
    preferredProvider &&
    candidateProviderIds.includes(preferredProvider) &&
    snapshot.availability.get(preferredProvider)
  ) {
    return preferredProvider;
  }

  for (const providerId of candidateProviderIds) {
    if (snapshot.availability.get(providerId)) {
      return providerId;
    }
  }

  return candidateProviderIds[0];
}

export function getCachedProviderMetas(): CliProviderMeta[] {
  return cachedProviders ?? [];
}

export function getProviderCapabilities(providerId: ProviderId): CliProviderCapabilities | null {
  if (!cachedProviders) return null;
  return cachedProviders.find((provider) => provider.id === providerId)?.capabilities ?? null;
}

export function getProviderDisplayName(providerId: ProviderId): string {
  return (
    cachedProviders?.find((provider) => provider.id === providerId)?.displayName ??
    DEFAULT_PROVIDER_DISPLAY_NAMES[providerId]
  );
}

const SHORT_PROVIDER_NAMES: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
};

/** Tab / office default — never "Session N". Skips names already in use. */
export function formatDefaultSessionName(
  providerId: string | undefined | null,
  ordinal: number,
  takenNames: Iterable<string> = [],
): string {
  const id =
    providerId === 'claude' ||
    providerId === 'codex' ||
    providerId === 'cursor' ||
    providerId === 'antigravity'
      ? providerId
      : null;
  const base = id ? SHORT_PROVIDER_NAMES[id] : 'Agent';
  const taken = new Set([...takenNames].map((name) => name.trim().toLowerCase()).filter(Boolean));
  let n = Math.max(1, Math.floor(Number.isFinite(ordinal) ? ordinal : 1));
  let candidate = `${base} ${n}`;
  while (taken.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${base} ${n}`;
  }
  return candidate;
}
