import type { Session, WebContents } from 'electron';

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

const LOCAL_ALLOWED_PERMISSIONS = new Set([
  'clipboard-sanitized-write',
  'fullscreen',
]);

interface PermissionRequestDetailsLike {
  requestingUrl?: string;
  requestingOrigin?: string;
}

function parseUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function isTrustedPermissionOrigin(raw: string | null | undefined): boolean {
  const parsed = parseUrl(raw);
  if (!parsed) return false;
  if (parsed.protocol === 'file:') return true;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
}

export function shouldAllowPermissionForOrigin(
  permission: string,
  rawOrigin: string | null | undefined,
): boolean {
  if (!LOCAL_ALLOWED_PERMISSIONS.has(permission)) return false;
  return isTrustedPermissionOrigin(rawOrigin);
}

function resolvePermissionOrigin(
  webContents: WebContents | null,
  requestingOrigin: string | null | undefined,
  details: PermissionRequestDetailsLike | undefined,
): string {
  return (
    details?.requestingUrl
    || details?.requestingOrigin
    || requestingOrigin
    || webContents?.getURL?.()
    || ''
  );
}

export function installSessionPermissionPolicy(ses: Session): void {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = resolvePermissionOrigin(
      webContents,
      undefined,
      details as PermissionRequestDetailsLike | undefined,
    );
    callback(shouldAllowPermissionForOrigin(permission, origin));
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const origin = resolvePermissionOrigin(
      webContents,
      requestingOrigin,
      details as PermissionRequestDetailsLike | undefined,
    );
    return shouldAllowPermissionForOrigin(permission, origin);
  });
}
