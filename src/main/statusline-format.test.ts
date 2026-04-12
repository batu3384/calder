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

  it('maps MiniMax models to minimax', () => {
    expect(inferStatuslineProvider('MiniMax-M2.7')).toBe('minimax');
    expect(inferStatuslineProvider('minimax-m2.7')).toBe('minimax');
  });

  it('maps Claude models to anthropic', () => {
    expect(inferStatuslineProvider('Claude Sonnet 4.6')).toBe('anthropic');
    expect(inferStatuslineProvider('haiku')).toBe('anthropic');
  });

  it('maps qwen models to qwen', () => {
    expect(inferStatuslineProvider('qwen3-coder')).toBe('qwen');
    expect(inferStatuslineProvider('QWEN-MAX')).toBe('qwen');
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

  it('shows Z.ai five-hour quota with reset time and omits the secondary window', () => {
    const out = formatHybridStatusLine({
      modelDisplayName: 'glm-5.1',
      provider: 'zai',
      effortLabel: null,
      cwdLabel: 'aa',
      contextPercent: 25,
      costLabel: '$0.22',
      quota: {
        provider: 'zai',
        model: 'glm-5.1',
        fiveHour: '60% left',
        fiveHourReset: '22:10',
        weekly: '90% left',
        weeklyLabel: 'Cycle',
        status: 'unknown',
        updatedAt: 1_000,
        source: 'zai:quota-limit',
      },
      nowMs: 1_500,
    });

    expect(out).toBe([
      'glm-5.1  Z.ai  --  aa',
      'Ctx 25%  Cost $0.22  5h 60% left · resets 22:10  Live',
    ].join('\n'));
  });

  it('shows MiniMax request quotas with reset time and weekly allowance', () => {
    const out = formatHybridStatusLine({
      modelDisplayName: 'MiniMax-M2.7',
      provider: 'minimax',
      effortLabel: null,
      cwdLabel: 'aa',
      contextPercent: 25,
      costLabel: '$0.07',
      quota: {
        provider: 'minimax',
        model: 'MiniMax-M2.7',
        fiveHour: '5/4500 left',
        fiveHourReset: '17:00',
        weekly: '5/45000 left',
        weeklyLabel: 'Week',
        status: 'unknown',
        updatedAt: 1_000,
        source: 'minimax:remains',
      },
      nowMs: 1_500,
    });

    expect(out).toBe([
      'MiniMax-M2.7  MiniMax  --  aa',
      'Ctx 25%  Cost $0.07  5h 5/4500 left · resets 17:00  Week 5/45000 left  Live',
    ].join('\n'));
  });
});

describe('getProviderQuotaCacheFile', () => {
  it('uses provider-specific cache file names', () => {
    expect(getProviderQuotaCacheFile('anthropic')).toBe('anthropic.quota.json');
    expect(getProviderQuotaCacheFile('zai')).toBe('zai.quota.json');
    expect(getProviderQuotaCacheFile('minimax')).toBe('minimax.quota.json');
    expect(getProviderQuotaCacheFile('qwen')).toBe('qwen.quota.json');
  });
});
