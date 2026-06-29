import { describe, expect, it } from 'vitest';

import { isAllowedGuestWebviewUrl } from './guest-webview-origin';

describe('isAllowedGuestWebviewUrl', () => {
  it('allows localhost and loopback HTTPS dev servers', () => {
    expect(isAllowedGuestWebviewUrl('https://localhost:8080/page')).toBe(true);
    expect(isAllowedGuestWebviewUrl('https://127.0.0.1:3000/app')).toBe(true);
  });

  it('rejects hostnames that only prefix-match localhost', () => {
    expect(isAllowedGuestWebviewUrl('https://localhost.evil.com/page')).toBe(false);
  });

  it('rejects non-HTTPS guest URLs', () => {
    expect(isAllowedGuestWebviewUrl('http://localhost:8080/page')).toBe(false);
  });
});
