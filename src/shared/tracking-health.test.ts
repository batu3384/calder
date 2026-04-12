import { describe, expect, it } from 'vitest';
import type { CliProviderMeta, ProviderId, SettingsValidationResult } from './types.js';
import { isTrackingHealthy, needsManagedStatusLine } from './tracking-health.js';

function createProvider(
  id: ProviderId,
  overrides?: Partial<CliProviderMeta['capabilities']>,
): CliProviderMeta {
  return {
    id,
    displayName: id,
    binaryName: id,
    defaultContextWindowSize: 200000,
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: true,
      pendingPromptTrigger: 'startup-arg',
      ...overrides,
    },
  };
}

function createValidation(overrides?: Partial<SettingsValidationResult>): SettingsValidationResult {
  return {
    statusLine: 'calder',
    hooks: 'complete',
    hookDetails: {},
    ...overrides,
  };
}

describe('tracking health helpers', () => {
  it('requires a managed status line when the provider surfaces cost or context tracking', () => {
    expect(needsManagedStatusLine(createProvider('claude'))).toBe(true);
  });

  it('allows providers without a managed status line requirement to stay healthy', () => {
    const meta = createProvider('blackbox', {
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
    });
    expect(isTrackingHealthy(meta, createValidation({ statusLine: 'missing', hooks: 'missing' }))).toBe(true);
  });

  it('marks missing hooks as unhealthy when the provider depends on them', () => {
    const meta = createProvider('qwen', {
      costTracking: false,
      contextWindow: false,
      hookStatus: true,
    });
    expect(isTrackingHealthy(meta, createValidation({ statusLine: 'calder', hooks: 'partial' }))).toBe(false);
  });
});

