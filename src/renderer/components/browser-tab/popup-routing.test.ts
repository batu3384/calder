import { describe, expect, it, vi } from 'vitest';
import { handleBrowserGuestOpenRequest } from './popup-routing';

describe('handleBrowserGuestOpenRequest', () => {
  it('opens http popup requests in a separate embedded browser surface', async () => {
    const openEmbedded = vi.fn();
    const openExternal = vi.fn();

    const result = await handleBrowserGuestOpenRequest(
      { url: 'https://example.com/docs', source: 'anchor' },
      { openEmbedded, openExternal },
    );

    expect(result).toBe('embedded');
    expect(openEmbedded).toHaveBeenCalledWith('https://example.com/docs');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('sends non-http popup requests to the OS handler', async () => {
    const openEmbedded = vi.fn();
    const openExternal = vi.fn();

    const result = await handleBrowserGuestOpenRequest(
      { url: 'mailto:test@example.com', source: 'window-open' },
      { openEmbedded, openExternal },
    );

    expect(result).toBe('external');
    expect(openExternal).toHaveBeenCalledWith('mailto:test@example.com');
    expect(openEmbedded).not.toHaveBeenCalled();
  });

  it('ignores malformed popup payloads', async () => {
    const openEmbedded = vi.fn();
    const openExternal = vi.fn();

    const result = await handleBrowserGuestOpenRequest(
      { url: '::::', source: 'anchor' },
      { openEmbedded, openExternal },
    );

    expect(result).toBe('ignored');
    expect(openEmbedded).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('ignores popup payloads with unsupported URL schemes', async () => {
    const openEmbedded = vi.fn();
    const openExternal = vi.fn();

    const result = await handleBrowserGuestOpenRequest(
      { url: 'javascript:alert(1)', source: 'window-open' },
      { openEmbedded, openExternal },
    );

    expect(result).toBe('ignored');
    expect(openEmbedded).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});
