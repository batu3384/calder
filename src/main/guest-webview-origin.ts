/** Allowed guest webview hostnames (HTTPS only). */
const ALLOWED_GUEST_WEBVIEW_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isAllowedGuestWebviewUrl(guestUrl: string): boolean {
  try {
    const parsed = new URL(guestUrl);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_GUEST_WEBVIEW_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}
