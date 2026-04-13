import { describe, expect, it } from 'vitest';
import { resolveBrowserGuestOpenPayload } from './browser-tab-popup';

describe('resolveBrowserGuestOpenPayload', () => {
  it('resolves relative anchor URLs against the current page', () => {
    expect(resolveBrowserGuestOpenPayload('/docs', 'https://example.com/app', 'anchor')).toEqual({
      url: 'https://example.com/docs',
      source: 'anchor',
    });
  });

  it('preserves external schemes that should leave the app', () => {
    expect(resolveBrowserGuestOpenPayload('mailto:test@example.com', 'https://example.com', 'window-open')).toEqual({
      url: 'mailto:test@example.com',
      source: 'window-open',
    });
  });

  it('rejects dangerous inline protocols', () => {
    expect(resolveBrowserGuestOpenPayload('javascript:alert(1)', 'https://example.com', 'window-open')).toBeNull();
    expect(resolveBrowserGuestOpenPayload('data:text/html,hello', 'https://example.com', 'window-open')).toBeNull();
  });
});
