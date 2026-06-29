import { describe, expect, it } from 'vitest';

import {
  deriveQuotaConfidence,
  describeProviderRoute,
  formatQuotaConfidenceLabel,
  inferGatewayBackendForModel,
} from './provider-route';

describe('inferGatewayBackendForModel', () => {
  it('keeps gateway backend inference separate from the native CLI provider', () => {
    expect(inferGatewayBackendForModel('Claude Sonnet 4.6')).toBe('anthropic');
    expect(inferGatewayBackendForModel('glm-5.1')).toBe('zai');
    expect(inferGatewayBackendForModel('MiniMax-M2.7')).toBe('minimax');
    expect(inferGatewayBackendForModel('qwen3-coder')).toBe('qwen');
  });
});

describe('describeProviderRoute', () => {
  it('represents Claude CLI routed through a gateway backend without changing the native provider', () => {
    expect(describeProviderRoute({ nativeProviderId: 'claude', model: 'glm-5.1' })).toEqual({
      nativeProviderId: 'claude',
      backendProviderId: 'zai',
      model: 'glm-5.1',
      routeKind: 'gateway',
      confidence: 'estimated',
    });
  });

  it('marks the first-party Claude path as a native CLI route', () => {
    expect(describeProviderRoute({ nativeProviderId: 'claude', model: 'Claude Sonnet 4.6', confidence: 'verified' })).toEqual({
      nativeProviderId: 'claude',
      backendProviderId: 'anthropic',
      model: 'Claude Sonnet 4.6',
      routeKind: 'native-cli',
      confidence: 'verified',
    });
  });
});

describe('deriveQuotaConfidence', () => {
  it('uses explicit unavailable states when quota data is missing or still syncing', () => {
    expect(deriveQuotaConfidence(null, 1_500, 60_000)).toBe('unavailable');
    expect(deriveQuotaConfidence({ status: 'syncing', updatedAt: 1_000, hasMeasuredValues: false }, 1_500, 60_000)).toBe('unavailable');
  });

  it('distinguishes verified measured values from estimated status-only snapshots', () => {
    expect(deriveQuotaConfidence({ status: 'unknown', updatedAt: 1_000, hasMeasuredValues: true }, 1_500, 60_000)).toBe('verified');
    expect(deriveQuotaConfidence({ status: 'unknown', updatedAt: 1_000, hasMeasuredValues: false }, 1_500, 60_000)).toBe('estimated');
  });

  it('marks old snapshots stale even when they have measured values', () => {
    expect(deriveQuotaConfidence({ status: 'unknown', updatedAt: 1_000, hasMeasuredValues: true }, 120_000, 60_000)).toBe('stale');
  });

  it('provides UI-safe labels for each confidence state', () => {
    expect(formatQuotaConfidenceLabel('verified')).toBe('Verified');
    expect(formatQuotaConfidenceLabel('estimated')).toBe('Estimated');
    expect(formatQuotaConfidenceLabel('stale')).toBe('Stale');
    expect(formatQuotaConfidenceLabel('unavailable')).toBe('Unavailable');
  });
});
