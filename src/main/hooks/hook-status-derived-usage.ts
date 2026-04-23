import type { ProviderId } from '../../shared/types/provider';
import type { CostData, InspectorEvent } from '../../shared/types/session';

interface DerivedUsageAccumulator {
  model: string | null;
  contextWindowSize: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  nonCachedInputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  totalApiDurationMs: number;
}

const PROVIDER_CONTEXT_WINDOW_DEFAULT: Record<ProviderId, number> = {
  claude: 200_000,
  codex: 200_000,
  copilot: 200_000,
  gemini: 1_000_000,
  qwen: 1_000_000,
};

const sessionProviders = new Map<string, ProviderId>();
const derivedUsageBySession = new Map<string, DerivedUsageAccumulator>();

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickUsageObject(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const candidate = toObject(payload[key]);
    if (candidate) return candidate;
  }
  return null;
}

function parseCodexUsage(event: InspectorEvent): {
  totalInputTokens: number;
  nonCachedInputTokens: number;
  cacheReadTokens: number;
  totalOutputTokens: number;
} | null {
  const payload = event as unknown as Record<string, unknown>;
  const usage = pickUsageObject(payload, ['usage']);
  if (!usage) return null;

  const rawInput = Math.max(0, toNumber(usage.input_tokens ?? usage.inputTokens) ?? 0);
  const rawOutput = Math.max(0, toNumber(usage.output_tokens ?? usage.outputTokens) ?? 0);
  const rawCached = Math.max(
    0,
    toNumber(
      usage.cached_input_tokens
      ?? usage.cachedInputTokens
      ?? usage.cache_read_input_tokens
      ?? usage.cacheReadInputTokens,
    ) ?? 0,
  );
  const nonCachedInput = Math.max(0, rawInput - rawCached);

  if (rawInput === 0 && rawOutput === 0 && rawCached === 0) return null;
  return {
    totalInputTokens: rawInput,
    nonCachedInputTokens: nonCachedInput,
    cacheReadTokens: rawCached,
    totalOutputTokens: rawOutput,
  };
}

function parseGeminiUsage(event: InspectorEvent): {
  totalInputTokens: number;
  nonCachedInputTokens: number;
  cacheReadTokens: number;
  totalOutputTokens: number;
} | null {
  const payload = event as unknown as Record<string, unknown>;
  const usage = pickUsageObject(payload, ['usage_metadata', 'usageMetadata']);
  if (!usage) return null;

  const promptTokens = Math.max(0, toNumber(usage.promptTokenCount ?? usage.prompt_tokens) ?? 0);
  const cachedTokens = Math.max(0, toNumber(usage.cachedContentTokenCount ?? usage.cached_content_token_count) ?? 0);
  const candidateTokens = Math.max(0, toNumber(usage.candidatesTokenCount ?? usage.candidates_token_count) ?? 0);
  const thoughtTokens = Math.max(0, toNumber(usage.thoughtsTokenCount ?? usage.thoughts_token_count) ?? 0);
  const totalTokens = Math.max(0, toNumber(usage.totalTokenCount ?? usage.total_token_count) ?? 0);

  let outputTokens = candidateTokens + thoughtTokens;
  if (outputTokens <= 0 && totalTokens > 0) {
    outputTokens = Math.max(0, totalTokens - promptTokens);
  }

  const nonCachedInputTokens = Math.max(0, promptTokens - cachedTokens);
  if (promptTokens === 0 && outputTokens === 0 && cachedTokens === 0) return null;

  return {
    totalInputTokens: promptTokens,
    nonCachedInputTokens,
    cacheReadTokens: cachedTokens,
    totalOutputTokens: outputTokens,
  };
}

function createDefaultDerivedUsage(sessionId: string): DerivedUsageAccumulator {
  const providerId = sessionProviders.get(sessionId);
  return {
    model: null,
    contextWindowSize: providerId ? PROVIDER_CONTEXT_WINDOW_DEFAULT[providerId] : 200_000,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    nonCachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
    totalApiDurationMs: 0,
  };
}

export function registerDerivedUsageSession(sessionId: string, providerId?: ProviderId): void {
  if (providerId) {
    sessionProviders.set(sessionId, providerId);
  }
}

export function unregisterDerivedUsageSession(sessionId: string): void {
  sessionProviders.delete(sessionId);
  derivedUsageBySession.delete(sessionId);
}

export function clearDerivedUsageSession(sessionId: string): void {
  derivedUsageBySession.delete(sessionId);
}

export function resetDerivedUsageState(): void {
  sessionProviders.clear();
  derivedUsageBySession.clear();
}

export function deriveCostDataFromEvents(sessionId: string, events: InspectorEvent[]): CostData | null {
  const providerId = sessionProviders.get(sessionId);
  if (providerId !== 'codex' && providerId !== 'gemini') {
    return null;
  }

  const usage = derivedUsageBySession.get(sessionId) ?? createDefaultDerivedUsage(sessionId);
  let changed = false;

  for (const event of events) {
    const payload = event as unknown as Record<string, unknown>;
    const model = typeof payload.model === 'string' ? payload.model.trim() : '';
    if (model && model !== usage.model) {
      usage.model = model;
      changed = true;
    }

    const parsedUsage = providerId === 'codex' ? parseCodexUsage(event) : parseGeminiUsage(event);
    if (parsedUsage) {
      usage.totalInputTokens += parsedUsage.totalInputTokens;
      usage.totalOutputTokens += parsedUsage.totalOutputTokens;
      usage.nonCachedInputTokens += parsedUsage.nonCachedInputTokens;
      usage.cacheReadTokens += parsedUsage.cacheReadTokens;
      changed = true;
    }

    const costSnapshot = toObject(payload.cost_snapshot);
    const costUsd = toNumber(costSnapshot?.total_cost_usd);
    if (costUsd !== null && costUsd > usage.totalCostUsd) {
      usage.totalCostUsd = costUsd;
      changed = true;
    }
    const totalDurationMs = toNumber(costSnapshot?.total_duration_ms);
    if (totalDurationMs !== null && totalDurationMs > usage.totalDurationMs) {
      usage.totalDurationMs = totalDurationMs;
      changed = true;
    }
    const totalApiDurationMs = toNumber(costSnapshot?.total_api_duration_ms);
    if (totalApiDurationMs !== null && totalApiDurationMs > usage.totalApiDurationMs) {
      usage.totalApiDurationMs = totalApiDurationMs;
      changed = true;
    }

    const contextSnapshot = toObject(payload.context_snapshot);
    const contextWindowSize = toNumber(
      contextSnapshot?.context_window_size
      ?? payload.context_window_size
      ?? payload.contextWindowSize,
    );
    if (contextWindowSize !== null && contextWindowSize > 0 && contextWindowSize !== usage.contextWindowSize) {
      usage.contextWindowSize = contextWindowSize;
      changed = true;
    }
  }

  if (!changed) return null;
  derivedUsageBySession.set(sessionId, usage);

  const usedTokens = usage.nonCachedInputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
  const usedPercentage = usage.contextWindowSize > 0
    ? (usedTokens / usage.contextWindowSize) * 100
    : 0;

  return {
    source: 'derived',
    model: usage.model ?? undefined,
    cost: {
      total_cost_usd: usage.totalCostUsd,
      total_duration_ms: usage.totalDurationMs,
      total_api_duration_ms: usage.totalApiDurationMs,
    },
    context_window: {
      total_input_tokens: usage.totalInputTokens,
      total_output_tokens: usage.totalOutputTokens,
      context_window_size: usage.contextWindowSize,
      used_percentage: usedPercentage,
      current_usage: {
        input_tokens: usage.nonCachedInputTokens,
        output_tokens: usage.totalOutputTokens,
        cache_creation_input_tokens: usage.cacheCreationTokens,
        cache_read_input_tokens: usage.cacheReadTokens,
      },
    },
  };
}
