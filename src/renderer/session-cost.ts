import { stripAnsi } from './ansi';
import type { CostData, CostInfo } from '../shared/types';

export type { CostInfo } from '../shared/types';

type CostChangeCallback = (sessionId: string, cost: CostInfo) => void;

const costs = new Map<string, CostInfo>();
const listeners: CostChangeCallback[] = [];

// Search for dollar cost patterns (fallback)
const COST_RE = /\$(\d+\.\d{2,})/g;

function getCostSource(cost: Pick<CostInfo, 'source'> | null | undefined): NonNullable<CostInfo['source']> {
  return cost?.source ?? 'structured';
}

export function isDerivedCost(cost: Pick<CostInfo, 'source'> | null | undefined): boolean {
  return getCostSource(cost) === 'derived';
}

export function isEstimatedCost(cost: Pick<CostInfo, 'source'> | null | undefined): boolean {
  const source = getCostSource(cost);
  return source === 'fallback' || source === 'derived';
}

export function setCostData(sessionId: string, rawData: CostData): void {
  const { cost, context_window: ctx, model, source } = rawData;

  const existing = costs.get(sessionId);
  const info: CostInfo = {
    totalCostUsd: cost.total_cost_usd ?? 0,
    totalInputTokens: ctx.total_input_tokens ?? 0,
    totalOutputTokens: ctx.total_output_tokens ?? 0,
    cacheReadTokens: ctx.current_usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: ctx.current_usage?.cache_creation_input_tokens ?? 0,
    totalDurationMs: cost.total_duration_ms ?? 0,
    totalApiDurationMs: cost.total_api_duration_ms ?? 0,
    model: model ?? existing?.model,
    source: source ?? 'structured',
  };

  if (existing && existing.totalCostUsd === info.totalCostUsd
    && existing.totalInputTokens === info.totalInputTokens
    && existing.totalOutputTokens === info.totalOutputTokens
    && existing.cacheReadTokens === info.cacheReadTokens
    && existing.cacheCreationTokens === info.cacheCreationTokens
    && existing.totalDurationMs === info.totalDurationMs
    && existing.totalApiDurationMs === info.totalApiDurationMs
    && existing.model === info.model
    && existing.source === info.source) return;

  costs.set(sessionId, info);
  for (const cb of listeners) cb(sessionId, info);
}

/** Fallback: parse $X.XX from raw terminal output (older CLI without statusline) */
export function parseCost(sessionId: string, rawData: string): void {
  // Never let the regex fallback overwrite verified structured cost data.
  const existing = costs.get(sessionId);
  if (existing?.source === 'structured') return;

  const clean = stripAnsi(rawData);
  let match: RegExpExecArray | null;
  let lastCost: string | null = null;

  while ((match = COST_RE.exec(clean)) !== null) {
    lastCost = match[0];
  }

  if (lastCost) {
    const usd = parseFloat(lastCost.replace('$', ''));
    if (!existing || existing.totalCostUsd !== usd) {
      const info: CostInfo = existing?.source === 'derived'
        ? {
            ...existing,
            totalCostUsd: usd,
            source: 'derived',
          }
        : {
            totalCostUsd: usd,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            totalDurationMs: 0,
            totalApiDurationMs: 0,
            source: 'fallback',
          };
      costs.set(sessionId, info);
      for (const cb of listeners) cb(sessionId, info);
    }
  }
}

export function getCost(sessionId: string): CostInfo | null {
  return costs.get(sessionId) ?? null;
}

export function getAggregateCost(options?: { includeEstimated?: boolean }): CostInfo {
  const includeEstimated = options?.includeEstimated ?? false;
  const aggregate: CostInfo = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalDurationMs: 0,
    totalApiDurationMs: 0,
    source: 'structured',
  };
  for (const info of costs.values()) {
    if (!includeEstimated && isEstimatedCost(info)) continue;
    aggregate.totalCostUsd += info.totalCostUsd;
    aggregate.totalInputTokens += info.totalInputTokens;
    aggregate.totalOutputTokens += info.totalOutputTokens;
    aggregate.cacheReadTokens += info.cacheReadTokens;
    aggregate.cacheCreationTokens += info.cacheCreationTokens;
    aggregate.totalDurationMs += info.totalDurationMs;
    aggregate.totalApiDurationMs += info.totalApiDurationMs;
  }
  return aggregate;
}

export function onChange(callback: CostChangeCallback): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

/** Restore cost from persisted session data (used on startup, silent — no listeners notified) */
export function restoreCost(sessionId: string, cost: CostInfo): void {
  costs.set(sessionId, { ...cost, source: cost.source ?? 'structured' });
}

export function removeSession(sessionId: string): void {
  costs.delete(sessionId);
}

/** @internal Test-only: reset all module state */
export function _resetForTesting(): void {
  costs.clear();
  listeners.length = 0;
}
