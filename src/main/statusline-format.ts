export type StatuslineProvider = 'anthropic' | 'zai' | 'minimax' | 'qwen';
export type ProviderQuotaStatus = 'syncing' | 'unknown' | 'unsupported';
export type QuotaFreshness = 'live' | 'syncing' | 'stale';

export interface ProviderQuotaSnapshot {
  provider: StatuslineProvider;
  model: string;
  fiveHour: string | null;
  fiveHourReset?: string | null;
  weekly: string | null;
  weeklyLabel?: string;
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
  minimax: 'MiniMax',
  qwen: 'Qwen',
};

export function inferStatuslineProvider(modelDisplayName: string): StatuslineProvider {
  const normalized = modelDisplayName.trim().toLowerCase();
  if (normalized.startsWith('glm-')) return 'zai';
  if (normalized.startsWith('minimax-')) return 'minimax';
  if (normalized.startsWith('qwen')) return 'qwen';
  return 'anthropic';
}

export function fallbackQuotaStatus(provider: StatuslineProvider): ProviderQuotaStatus {
  if (provider === 'zai' || provider === 'minimax') return 'syncing';
  return 'unsupported';
}

export function getProviderQuotaCacheFile(provider: StatuslineProvider): string {
  return `${provider}.quota.json`;
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
  const weeklyLabel = view.quota?.weeklyLabel?.trim() || 'Week';
  const fiveHourReset = view.quota?.fiveHourReset?.trim();
  const fiveHourValue = view.quota?.fiveHour ?? quotaStatus;
  const fiveHourLabel = fiveHourReset ? `${fiveHourValue} · resets ${fiveHourReset}` : fiveHourValue;
  const line1 = [
    view.modelDisplayName || 'Unknown Model',
    PROVIDER_LABELS[view.provider],
    view.effortLabel?.trim() || '--',
    view.cwdLabel || 'project',
  ].join('  ');
  const quotaParts = [`5h ${fiveHourLabel}`];
  if (view.provider !== 'zai') {
    quotaParts.push(`${weeklyLabel} ${view.quota?.weekly ?? quotaStatus}`);
  }
  const line2 = [
    `Ctx ${contextLabel}%`,
    `Cost ${costLabel}`,
    ...quotaParts,
    freshness,
  ].join('  ');
  return `${line1}\n${line2}`;
}
