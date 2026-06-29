import type {
  GatewayBackendId,
  ProviderGatewayRoute,
  ProviderId,
  ProviderRouteConfidence,
  QuotaConfidence,
} from './types-provider';

export type { QuotaConfidence };

export interface DescribeProviderRouteInput {
  nativeProviderId: ProviderId;
  model: string;
  backendProviderId?: GatewayBackendId;
  confidence?: ProviderRouteConfidence;
}

export interface QuotaConfidenceInput {
  status?: 'syncing' | 'unknown' | 'unsupported' | string;
  updatedAt?: number | null;
  hasMeasuredValues?: boolean;
}

export const QUOTA_CONFIDENCE_LABELS: Record<QuotaConfidence, string> = {
  verified: 'Verified',
  estimated: 'Estimated',
  stale: 'Stale',
  unavailable: 'Unavailable',
};

export function inferGatewayBackendForModel(modelDisplayName: string): GatewayBackendId {
  const normalized = modelDisplayName.trim().toLowerCase();
  if (normalized.startsWith('glm-')) return 'zai';
  if (normalized.startsWith('minimax-')) return 'minimax';
  if (normalized.startsWith('qwen')) return 'qwen';
  return 'anthropic';
}

export function getNativeCliDefaultBackend(providerId: ProviderId): GatewayBackendId | null {
  if (providerId === 'claude') return 'anthropic';
  if (providerId === 'qwen') return 'qwen';
  return null;
}

export function describeProviderRoute(input: DescribeProviderRouteInput): ProviderGatewayRoute {
  const backendProviderId = input.backendProviderId ?? inferGatewayBackendForModel(input.model);
  const nativeDefaultBackend = getNativeCliDefaultBackend(input.nativeProviderId);
  const routeKind = nativeDefaultBackend === backendProviderId ? 'native-cli' : 'gateway';

  return {
    nativeProviderId: input.nativeProviderId,
    backendProviderId,
    model: input.model,
    routeKind,
    confidence: input.confidence ?? 'estimated',
  };
}

export function deriveQuotaConfidence(
  snapshot: QuotaConfidenceInput | null,
  nowMs = Date.now(),
  staleAfterMs = 5 * 60_000,
): QuotaConfidence {
  if (!snapshot) return 'unavailable';
  if (snapshot.status === 'syncing' || snapshot.status === 'unsupported') return 'unavailable';
  if (typeof snapshot.updatedAt === 'number' && nowMs - snapshot.updatedAt > staleAfterMs)
    return 'stale';
  return snapshot.hasMeasuredValues ? 'verified' : 'estimated';
}

export function formatQuotaConfidenceLabel(confidence: QuotaConfidence): string {
  return QUOTA_CONFIDENCE_LABELS[confidence];
}
