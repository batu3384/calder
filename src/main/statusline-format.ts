export type StatuslineProvider = 'anthropic' | 'zai';
export type ProviderQuotaStatus = 'syncing' | 'unknown' | 'unsupported';
export type QuotaFreshness = 'live' | 'syncing' | 'stale';

export interface ProviderQuotaSnapshot {
  provider: StatuslineProvider;
  model: string;
  fiveHour: string | null;
  weekly: string | null;
  status: ProviderQuotaStatus;
  updatedAt: number;
  source: string;
  message?: string;
}

export interface HybridStatuslineView {
  modelDisplayName: string;
  provider: StatuslineProvider;
  effortLabel?: string | null;
  cwdLabel: string;
  contextPercent?: number | null;
  costLabel?: string | null;
  quota: ProviderQuotaSnapshot | null;
  nowMs?: number;
}

export const DEFAULT_STATUSLINE_STALE_MS = 5 * 60_000;

const PROVIDER_LABELS: Record<StatuslineProvider, string> = {
  anthropic: 'Anthropic',
  zai: 'Z.ai',
};

export function inferStatuslineProvider(modelDisplayName: string): StatuslineProvider {
  const normalized = modelDisplayName.trim().toLowerCase();
  return normalized.startsWith('glm-') ? 'zai' : 'anthropic';
}

export function fallbackQuotaStatus(provider: StatuslineProvider): ProviderQuotaStatus {
  return provider === 'anthropic' ? 'unsupported' : 'syncing';
}

export function deriveQuotaFreshness(
  snapshot: ProviderQuotaSnapshot | null,
  nowMs = Date.now(),
  staleAfterMs = DEFAULT_STATUSLINE_STALE_MS,
): QuotaFreshness {
  if (!snapshot) return 'syncing';
  if (snapshot.status === 'syncing') return 'syncing';
  return nowMs - snapshot.updatedAt > staleAfterMs ? 'stale' : 'live';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatHybridStatusLine(view: HybridStatuslineView): string {
  const quotaStatus = view.quota?.status ?? fallbackQuotaStatus(view.provider);
  const freshness = titleCase(deriveQuotaFreshness(view.quota, view.nowMs));
  const contextLabel = view.contextPercent == null ? '--' : String(view.contextPercent);
  const costLabel = view.costLabel?.trim() || '--';
  const line1 = [
    view.modelDisplayName || 'Unknown Model',
    PROVIDER_LABELS[view.provider],
    view.effortLabel?.trim() || '--',
    view.cwdLabel || 'project',
  ].join('  ');
  const line2 = [
    `Ctx ${contextLabel}%`,
    `Cost ${costLabel}`,
    `5h ${view.quota?.fiveHour ?? quotaStatus}`,
    `Week ${view.quota?.weekly ?? quotaStatus}`,
    freshness,
  ].join('  ');
  return `${line1}\n${line2}`;
}
