import { describe, expect, it, vi } from 'vitest';
import {
  isAllowedExternalUrl,
  isEmbeddedBrowserCandidate,
  openUrlWithBrowserPolicy,
} from './browser-open-policy';

describe('isEmbeddedBrowserCandidate', () => {
  it('treats loopback dev urls as embedded browser targets', () => {
    expect(isEmbeddedBrowserCandidate('http://localhost:3000')).toBe(true);
    expect(isEmbeddedBrowserCandidate('https://127.0.0.1:4173/path')).toBe(true);
    expect(isEmbeddedBrowserCandidate('http://0.0.0.0:8787')).toBe(true);
    expect(isEmbeddedBrowserCandidate('http://[::1]:3000')).toBe(true);
  });

  it('keeps public urls out of the embedded browser path', () => {
    expect(isEmbeddedBrowserCandidate('https://example.com')).toBe(false);
    expect(isEmbeddedBrowserCandidate('https://github.com/batuhanyuksel/calder')).toBe(false);
    expect(isEmbeddedBrowserCandidate('mailto:test@example.com')).toBe(false);
    expect(isEmbeddedBrowserCandidate('not a url')).toBe(false);
  });

  it('allows only safe external URL schemes', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(true);
    expect(isAllowedExternalUrl('mailto:test@example.com')).toBe(true);
    expect(isAllowedExternalUrl('tel:+905550000000')).toBe(true);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,hi')).toBe(false);
    expect(isAllowedExternalUrl('file:///Applications/Calder.app')).toBe(false);
  });

  it('routes localhost urls into the embedded browser when a window is available', async () => {
    const send = vi.fn();
    const openExternal = vi.fn();

    const result = await openUrlWithBrowserPolicy(
      { url: 'http://localhost:3000', cwd: '/workspace/app' },
      { webContents: { send } },
      openExternal,
    );

    expect(result).toBe('embedded');
    expect(send).toHaveBeenCalledWith('app:openEmbeddedBrowserUrl', {
      url: 'http://localhost:3000',
      cwd: '/workspace/app',
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('falls back to the OS browser for public urls', async () => {
    const send = vi.fn();
    const openExternal = vi.fn();

    const result = await openUrlWithBrowserPolicy(
      'https://example.com',
      { webContents: { send } },
      openExternal,
    );

    expect(result).toBe('external');
    expect(send).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('keeps shell-initiated browser opens inside Calder even for public urls', async () => {
    const send = vi.fn();
    const openExternal = vi.fn();

    const result = await openUrlWithBrowserPolicy(
      { url: 'https://example.com/docs', preferEmbedded: true, cwd: '/workspace/app' },
      { webContents: { send } },
      openExternal,
    );

    expect(result).toBe('embedded');
    expect(send).toHaveBeenCalledWith('app:openEmbeddedBrowserUrl', {
      url: 'https://example.com/docs',
      preferEmbedded: true,
      cwd: '/workspace/app',
    });
    expect(openExternal).not.toHaveBeenCalled();
  });
});
