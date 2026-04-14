import { describe, expect, it, vi } from 'vitest';
import { attachBrowserWebviewRouting } from './browser-webview-routing';

type Handler = (...args: any[]) => void;
type WindowOpenHandler = (details: { url: string }) => { action: 'allow' | 'deny' };

class FakeWebContents {
  windowOpenHandler: WindowOpenHandler | null = null;
  listeners = new Map<string, Handler[]>();
  loadURL = vi.fn();

  setWindowOpenHandler(handler: WindowOpenHandler): void {
    this.windowOpenHandler = handler;
  }

  on(event: string, listener: Handler): this {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
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
});
