import { describe, expect, it } from 'vitest';
import { buildProviderIconMarkup } from './tab-provider-icon.js';

describe('buildProviderIconMarkup', () => {
  it('renders existing image assets for providers that have icons', () => {
    expect(buildProviderIconMarkup('claude', true)).toContain('assets/providers/claude.png');
    expect(buildProviderIconMarkup('claude', true)).toContain('img');
  });

  it('renders a visible fallback badge for qwen when no asset exists', () => {
    const markup = buildProviderIconMarkup('qwen', true);
    expect(markup).toContain('tab-provider-fallback');
    expect(markup).toContain('tab-provider-fallback-qwen');
    expect(markup).toContain('QW');
  });

  it('renders a visible fallback badge for minimax when no asset exists', () => {
    const markup = buildProviderIconMarkup('minimax' as any, true);
    expect(markup).toContain('tab-provider-fallback');
    expect(markup).toContain('tab-provider-fallback-minimax');
    expect(markup).toContain('MM');
  });

  it('returns an empty string when provider icons are disabled', () => {
    expect(buildProviderIconMarkup('qwen', false)).toBe('');
  });
});
