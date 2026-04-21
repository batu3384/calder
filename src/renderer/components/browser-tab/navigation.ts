import type { BrowserTabInstance } from './types.js';

const KNOWN_SCHEMES = /^(https?|file|ftp|ftps|about|chrome|data|blob|view-source|javascript|mailto):/i;
export const STALE_NAVIGATION_REVERT_WINDOW_MS = 1800;
export type BrowserPageState = 'ready' | 'loading' | 'local' | 'remote' | 'offline';
type PendingNavigationInstance = Pick<
  BrowserTabInstance,
  'pendingNavigationUrl' | 'pendingNavigationPreviousUrl' | 'pendingNavigationAt'
>;

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed && !KNOWN_SCHEMES.test(trimmed)) {
    return 'http://' + trimmed;
  }
  return trimmed;
}

export function canonicalizeNavigationUrl(value: string | undefined): string {
  const url = (value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    return parsed.href;
  } catch {
    return url;
  }
}

export function isLocalBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(parsed.hostname.toLowerCase());
  } catch {
    return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([/:]|$)/i.test(url);
  }
}

export function resolveBrowserPageState(url: string, isLoading: boolean, offline: boolean): BrowserPageState {
  if (offline) return 'offline';
  if (isLoading) return 'loading';

  try {
    const parsed = new URL(url);
    if (isLocalBrowserUrl(url)) {
      return 'local';
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return 'remote';
    }
  } catch {}

  return 'ready';
}

export function describeBrowserPageState(state: BrowserPageState): string {
  switch (state) {
    case 'loading':
      return 'Loading';
    case 'local':
      return 'Local';
    case 'remote':
      return 'Remote';
    case 'offline':
      return 'Offline';
    default:
      return 'Ready';
  }
}

export function clearPendingNavigation(instance: PendingNavigationInstance): void {
  delete instance.pendingNavigationUrl;
  delete instance.pendingNavigationPreviousUrl;
  delete instance.pendingNavigationAt;
}

export function isStaleNavigationRevert(
  instance: PendingNavigationInstance,
  nextUrl: string,
  now = Date.now(),
): boolean {
  const pendingUrl = canonicalizeNavigationUrl(instance.pendingNavigationUrl);
  if (!pendingUrl) return false;
  const pendingAt = instance.pendingNavigationAt;
  if (!pendingAt || now - pendingAt > STALE_NAVIGATION_REVERT_WINDOW_MS) {
    clearPendingNavigation(instance);
    return false;
  }

  const candidateUrl = canonicalizeNavigationUrl(nextUrl);
  if (!candidateUrl) return false;
  if (candidateUrl === pendingUrl) return false;

  const previousUrl = canonicalizeNavigationUrl(instance.pendingNavigationPreviousUrl);
  if (previousUrl && candidateUrl === previousUrl) {
    return true;
  }
  return false;
}

export function navigateTo(instance: BrowserTabInstance, url: string): void {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return;
  instance.pendingNavigationPreviousUrl = instance.committedUrl;
  instance.pendingNavigationUrl = normalizedUrl;
  instance.pendingNavigationAt = Date.now();
  instance.committedUrl = normalizedUrl;
  instance.urlInput.value = normalizedUrl;
  instance.newTabPage.dataset.mode = normalizedUrl === 'about:blank' ? 'default' : 'hidden';
  instance.syncSurfaceVisibility(normalizedUrl === 'about:blank');
  instance.webview.src = normalizedUrl;
  instance.syncAddressBarState();
}
