import { shell } from 'electron';
import type { WebContents } from 'electron';
import { isAllowedExternalUrl } from './browser-open-policy';

type WindowOpenHandler = (details: { url: string }) => { action: 'allow' | 'deny' };
type EventHandler = (...args: any[]) => void;

interface WebContentsLike {
  setWindowOpenHandler(handler: WindowOpenHandler): void;
  on(event: string, listener: EventHandler): this;
  loadURL?(url: string): Promise<void> | void;
}

interface BrowserWindowLike {
  webContents: WebContentsLike;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function createExternalRouteDispatcher(openExternal: (url: string) => void): (url: string) => void {
  let lastUrl = '';
  let lastAt = 0;
  const dedupeWindowMs = 800;
  return (url: string) => {
    if (!isAllowedExternalUrl(url)) return;
    const now = Date.now();
    if (url === lastUrl && now - lastAt <= dedupeWindowMs) return;
    lastUrl = url;
    lastAt = now;
    openExternal(url);
  };
}

function redirectGuestWindowToCurrentView(
  guestContents: WebContentsLike,
  routeExternal: (url: string) => void,
): void {
  guestContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      void guestContents.loadURL?.(url);
    } else if (isAllowedExternalUrl(url)) {
      routeExternal(url);
    }
    return { action: 'deny' };
  });
}

export function attachBrowserWebviewRouting(
  mainWindow: BrowserWindowLike,
  openExternal: (url: string) => void = (url) => { void shell.openExternal(url); },
): void {
  const routeExternal = createExternalRouteDispatcher(openExternal);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      routeExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event: { preventDefault(): void }, url: string) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (isHttpUrl(url)) {
      routeExternal(url);
    }
  });

  mainWindow.webContents.on('did-attach-webview', (_event: unknown, guestContents: WebContents) => {
    redirectGuestWindowToCurrentView(guestContents, routeExternal);
  });
}
