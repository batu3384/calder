import { describe, expect, it, vi } from 'vitest';

import { attachBrowserWebviewRouting } from './browser-webview-routing';

type WindowOpenHandler = (details: { url: string }) => { action: 'allow' | 'deny' };
type NavigateEvent = { preventDefault(): void };
type WillNavigateHandler = (event: NavigateEvent, url: string) => void;
type AttachWebviewHandler = (event: unknown, guestContents: FakeWebContents) => void;

class FakeWebContents {
  windowOpenHandler: WindowOpenHandler | null = null;
  willNavigateHandlers: WillNavigateHandler[] = [];
  attachWebviewHandlers: AttachWebviewHandler[] = [];
  loadURL = vi.fn();

  setWindowOpenHandler(handler: WindowOpenHandler): void {
    this.windowOpenHandler = handler;
  }

  on(event: 'will-navigate', listener: WillNavigateHandler): this;
  on(event: 'did-attach-webview', listener: AttachWebviewHandler): this;
  on(event: 'will-navigate' | 'did-attach-webview', listener: WillNavigateHandler | AttachWebviewHandler): this {
    if (event === 'will-navigate') {
      this.willNavigateHandlers.push(listener as WillNavigateHandler);
    } else {
      this.attachWebviewHandlers.push(listener as AttachWebviewHandler);
    }
    return this;
  }

  emit(event: 'will-navigate', eventArg: NavigateEvent, url: string): void;
  emit(event: 'did-attach-webview', eventArg: unknown, guest: FakeWebContents): void;
  emit(event: 'will-navigate' | 'did-attach-webview', ...args: unknown[]): void {
    if (event === 'will-navigate') {
      const [eventArg, url] = args as [NavigateEvent, string];
      for (const listener of this.willNavigateHandlers) {
        listener(eventArg, url);
      }
      return;
    }
    const [eventArg, guest] = args as [unknown, FakeWebContents];
    for (const listener of this.attachWebviewHandlers) {
      listener(eventArg, guest);
    }
  }
}

describe('attachBrowserWebviewRouting', () => {
  it('opens top-level app links externally', () => {
    const host = new FakeWebContents();
    const openExternal = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);

    const result = host.windowOpenHandler?.({ url: 'https://example.com' });

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('denies non-http top-level window opens without routing them externally', () => {
    const host = new FakeWebContents();
    const openExternal = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);

    const result = host.windowOpenHandler?.({ url: 'mailto:test@example.com' });

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('keeps webview popup links inside the same guest contents', () => {
    const host = new FakeWebContents();
    const guest = new FakeWebContents();
    const openExternal = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);
    host.emit('did-attach-webview', {}, guest);

    const result = guest.windowOpenHandler?.({ url: 'http://localhost:3000/docs' });

    expect(result).toEqual({ action: 'deny' });
    expect(guest.loadURL).toHaveBeenCalledWith('http://localhost:3000/docs');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('still sends non-http guest popups to the OS handler', () => {
    const host = new FakeWebContents();
    const guest = new FakeWebContents();
    const openExternal = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);
    host.emit('did-attach-webview', {}, guest);

    const result = guest.windowOpenHandler?.({ url: 'mailto:test@example.com' });

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('mailto:test@example.com');
    expect(guest.loadURL).not.toHaveBeenCalled();
  });

  it('blocks unsupported guest popup schemes', () => {
    const host = new FakeWebContents();
    const guest = new FakeWebContents();
    const openExternal = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);
    host.emit('did-attach-webview', {}, guest);

    const result = guest.windowOpenHandler?.({ url: 'javascript:alert(1)' });

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).not.toHaveBeenCalled();
    expect(guest.loadURL).not.toHaveBeenCalled();
  });

  it('reroutes top-level navigations externally while allowing local file navigation', () => {
    const host = new FakeWebContents();
    const openExternal = vi.fn();
    const preventDefault = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);

    host.emit('will-navigate', { preventDefault }, 'https://example.com/docs');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');

    preventDefault.mockClear();
    openExternal.mockClear();
    host.emit('will-navigate', { preventDefault }, 'file:///Applications/Calder.app');
    expect(preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('blocks guest navigations outside the localhost allowlist', () => {
    const host = new FakeWebContents();
    const guest = new FakeWebContents();
    const openExternal = vi.fn();
    const preventDefault = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);
    host.emit('did-attach-webview', {}, guest);
    guest.emit('will-navigate', { preventDefault }, 'https://localhost.evil.com/page');

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('deduplicates repeated external routes for the same url in quick succession', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const host = new FakeWebContents();
    const openExternal = vi.fn();
    const preventDefault = vi.fn();

    attachBrowserWebviewRouting({ webContents: host }, openExternal);

    host.windowOpenHandler?.({ url: 'https://example.com/docs' });
    host.emit('will-navigate', { preventDefault }, 'https://example.com/docs');

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
    vi.useRealTimers();
  });
});
