import { describe, expect, it } from 'vitest';

import type { CliProviderMeta, ProviderId } from '../../../shared/types/provider.js';
import {
  resolvePreferredProviderForLaunch,
  resolveProviderForCheck,
  shouldRenderInlineProviderSelector,
} from '../surface-services/provider-availability.js';

function createProvider(id: ProviderId, displayName: string): CliProviderMeta {
  return {
    id,
    displayName,
    binaryName: id,
    defaultContextWindowSize: 200000,
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: true,
      pendingPromptTrigger: 'session-start',
    },
  };
}

describe('command deck provider selector helpers', () => {
  const snapshot = {
    providers: [
      createProvider('claude', 'Claude Code'),
      createProvider('codex', 'OpenAI Codex'),
      createProvider('antigravity', 'Antigravity CLI'),
    ],
    availability: new Map<ProviderId, boolean>([
      ['claude', false],
      ['codex', true],
      ['antigravity', true],
    ]),
  };

  it('falls back to the first available provider when the preferred one is unavailable', () => {
    expect(resolvePreferredProviderForLaunch('claude', snapshot)).toBe('codex');
  });

  it('keeps the preferred provider when it is available', () => {
    expect(resolvePreferredProviderForLaunch('antigravity', snapshot)).toBe('antigravity');
  });

  it('prefers a failing check provider over unrelated available defaults', () => {
    expect(resolveProviderForCheck('claude', ['antigravity'], snapshot)).toBe('antigravity');
  });

  it('keeps the preferred provider when it is one of the failing check providers', () => {
    expect(resolveProviderForCheck('antigravity', ['codex', 'antigravity'], snapshot)).toBe(
      'antigravity',
    );
  });

  it('shows the inline selector when multiple providers are actually available', () => {
    expect(shouldRenderInlineProviderSelector(snapshot)).toBe(true);
  });

  it('hides the inline selector when only one provider is available', () => {
    expect(
      shouldRenderInlineProviderSelector({
        ...snapshot,
        availability: new Map<ProviderId, boolean>([
          ['claude', false],
          ['codex', true],
          ['antigravity', false],
        ]),
      }),
    ).toBe(false);
  });
});
