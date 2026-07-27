import { describe, expect, it } from 'vitest';

import { buildProviderIconMarkup } from './tab-provider-icon.js';

describe('buildProviderIconMarkup', () => {
  it('renders existing image assets for providers that have icons', () => {
    expect(buildProviderIconMarkup('claude', true)).toContain('assets/providers/claude.png');
    expect(buildProviderIconMarkup('claude', true)).toContain('img');
  });

  it('renders a visible fallback badge for cursor when no asset exists', () => {
    const markup = buildProviderIconMarkup('cursor', true);
    expect(markup).toContain('tab-provider-fallback');
    expect(markup).toContain('tab-provider-fallback-cursor');
    expect(markup).toContain('CR');
  });

  it('returns an empty string when provider icons are disabled', () => {
    expect(buildProviderIconMarkup('cursor', false)).toBe('');
  });

  it('returns empty markup for unknown provider ids', () => {
    expect(buildProviderIconMarkup('evil' as never, true)).toBe('');
    expect(buildProviderIconMarkup('evil<script>' as never, true)).toBe('');
  });
});
