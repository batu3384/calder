import { describe, expect, it, vi } from 'vitest';
import {
  installSessionPermissionPolicy,
  isTrustedPermissionOrigin,
  shouldAllowPermissionForOrigin,
} from './session-permission-policy';

describe('session-permission-policy', () => {
  it('treats file and loopback origins as trusted permission origins', () => {
    expect(isTrustedPermissionOrigin('file:///Users/test/index.html')).toBe(true);
    expect(isTrustedPermissionOrigin('http://localhost:3000')).toBe(true);
    expect(isTrustedPermissionOrigin('https://127.0.0.1:4173')).toBe(true);
    expect(isTrustedPermissionOrigin('https://example.com')).toBe(false);
    expect(isTrustedPermissionOrigin('javascript:alert(1)')).toBe(false);
    expect(isTrustedPermissionOrigin('')).toBe(false);
  });

  it('allows only an explicit local permission allowlist', () => {
    expect(shouldAllowPermissionForOrigin('fullscreen', 'file:///tmp/page.html')).toBe(true);
    expect(shouldAllowPermissionForOrigin('clipboard-sanitized-write', 'http://localhost:3000')).toBe(true);
    expect(shouldAllowPermissionForOrigin('notifications', 'file:///tmp/page.html')).toBe(false);
    expect(shouldAllowPermissionForOrigin('fullscreen', 'https://example.com')).toBe(false);
  });

  it('installs both request and check handlers and denies remote requests', () => {
    let requestHandler:
      | ((webContents: { getURL?: () => string }, permission: string, callback: (granted: boolean) => void, details?: { requestingUrl?: string }) => void)
      | null = null;
    let checkHandler:
      | ((webContents: { getURL?: () => string }, permission: string, requestingOrigin?: string, details?: { requestingUrl?: string }) => boolean)
      | null = null;

    const fakeSession = {
      setPermissionRequestHandler: vi.fn((handler) => {
        requestHandler = handler;
      }),
      setPermissionCheckHandler: vi.fn((handler) => {
        checkHandler = handler;
      }),
    };

    installSessionPermissionPolicy(fakeSession as any);
    expect(fakeSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(fakeSession.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    expect(requestHandler).toBeTypeOf('function');
    expect(checkHandler).toBeTypeOf('function');

    let granted = true;
    requestHandler?.({ getURL: () => 'https://example.com' }, 'fullscreen', (ok) => {
      granted = ok;
    }, { requestingUrl: 'https://example.com' });
    expect(granted).toBe(false);

    const localAllowed = checkHandler?.(
      { getURL: () => 'file:///Users/test/index.html' },
      'fullscreen',
      undefined,
      { requestingUrl: 'file:///Users/test/index.html' },
    );
    expect(localAllowed).toBe(true);
  });
});
