// Loopback HTTP is allowed because local development servers commonly use it and browsers treat loopback as a secure context.
const ALLOWED_GUEST_WEBVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedGuestWebviewUrl(guestUrl: string): boolean {
  try {
    const parsed = new URL(guestUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return ALLOWED_GUEST_WEBVIEW_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
