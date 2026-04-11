import { describe, expect, it } from 'vitest';
import {
  deriveQuotaFreshness,
  formatHybridStatusLine,
  getProviderQuotaCacheFile,
  inferStatuslineProvider,
  type ProviderQuotaSnapshot,
} from './statusline-format';

describe('inferStatuslineProvider', () => {
  it('maps glm models to z.ai', () => {
    expect(inferStatuslineProvider('glm-5.1')).toBe('zai');
    expect(inferStatuslineProvider('GLM-4.5-Air')).toBe('zai');
  });

  it('maps Claude models to anthropic', () => {
    expect(inferStatuslineProvider('Claude Sonnet 4.6')).toBe('anthropic');
    expect(inferStatuslineProvider('haiku')).toBe('anthropic');
  });
});

describe('deriveQuotaFreshness', () => {
  it('marks a recent unknown snapshot as live', () => {
    const snapshot: ProviderQuotaSnapshot = {
      provider: 'anthropic',
      model: 'Claude Sonnet 4.6',
      fiveHour: null,
      weekly: null,
      status: 'unknown',
      updatedAt: 1_000,
      source: 'anthropic:none',
    };
    expect(deriveQuotaFreshness(snapshot, 1_500, 60_000)).toBe('live');
  });

  it('marks an old snapshot as stale', () => {
    const snapshot: ProviderQuotaSnapshot = {
      provider: 'zai',
      model: 'glm-5.1',
      fiveHour: null,
      weekly: null,
      status: 'unknown',
      updatedAt: 1_000,
      source: 'zai:none',
    };
    expect(deriveQuotaFreshness(snapshot, 120_000, 60_000)).toBe('stale');
  });
});

describe('formatHybridStatusLine', () => {
  it('renders honest unknown quota values with a live freshness badge', () => {
    const out = formatHybridStatusLine({
      modelDisplayName: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      effortLabel: 'High',
      cwdLabel: 'browser',
      contextPercent: 38,
      costLabel: '--',
      quota: {
        provider: 'anthropic',
        model: 'Claude Sonnet 4.6',
        fiveHour: null,
        weekly: null,
        status: 'unknown',
        updatedAt: 1_000,
        source: 'anthropic:none',
      },
      nowMs: 1_500,
    });

    expect(out).toBe([
      'Claude Sonnet 4.6  Anthropic  High  browser',
      'Ctx 38%  Cost --  5h unknown  Week unknown  Live',
    ].join('\n'));
  });
});

describe('getProviderQuotaCacheFile', () => {
  it('uses provider-specific cache file names', () => {
    expect(getProviderQuotaCacheFile('anthropic')).toBe('anthropic.quota.json');
    expect(getProviderQuotaCacheFile('zai')).toBe('zai.quota.json');
  });
});
