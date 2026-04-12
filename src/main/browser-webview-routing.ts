import { shell } from 'electron';
import type { WebContents } from 'electron';

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

function redirectGuestWindowToCurrentView(
  guestContents: WebContentsLike,
  openExternal: (url: string) => void,
): void {
  guestContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      void guestContents.loadURL?.(url);
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });
}

export function attachBrowserWebviewRouting(
  mainWindow: BrowserWindowLike,
  openExternal: (url: string) => void = (url) => { void shell.openExternal(url); },
): void {
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event: { preventDefault(): void }, url: string) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (isHttpUrl(url)) {
      openExternal(url);
    }
  });

  mainWindow.webContents.on('did-attach-webview', (_event: unknown, guestContents: WebContents) => {
    redirectGuestWindowToCurrentView(guestContents, openExternal);
  });
}
