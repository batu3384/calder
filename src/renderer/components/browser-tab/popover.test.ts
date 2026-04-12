import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enablePopoverDragging, positionPopover, setPopoverPosition } from './popover.js';

class FakeClassList {
  private values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }
}

class FakeElement {
  style: Record<string, string> = {};
  classList = new FakeClassList();
  listeners = new Map<string, Array<(event: any) => void>>();

  constructor(private rect: { left: number; top: number; width: number; height: number }) {}

  addEventListener(event: string, cb: (event: any) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(cb);
    this.listeners.set(event, current);
  }

  removeEventListener(event: string, cb: (event: any) => void): void {
    const current = this.listeners.get(event) ?? [];
    this.listeners.set(event, current.filter((listener) => listener !== cb));
  }

  dispatch(event: string, payload: any): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }

  getBoundingClientRect() {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
    };
  }
}

class FakeDocument {
  body = { style: {} as Record<string, string> };
  listeners = new Map<string, Array<(event: any) => void>>();

  addEventListener(event: string, cb: (event: any) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(cb);
    this.listeners.set(event, current);
  }

  removeEventListener(event: string, cb: (event: any) => void): void {
    const current = this.listeners.get(event) ?? [];
    this.listeners.set(event, current.filter((listener) => listener !== cb));
  }

  dispatch(event: string, payload: any): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }
}

function makeInstance() {
  return {
    element: new FakeElement({ left: 0, top: 0, width: 200, height: 160 }),
    webview: new FakeElement({ left: 20, top: 24, width: 150, height: 120 }),
  } as any;
}

describe('browser popover positioning', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new FakeDocument());
  });

  it('translates webview-local coordinates into pane-local popover coordinates', () => {
    const instance = makeInstance();
    const popover = new FakeElement({ left: 0, top: 0, width: 90, height: 40 }) as any;

    positionPopover(instance, popover, 30, 16);

    expect(popover.style.left).toBe('50px');
    expect(popover.style.top).toBe('40px');
  });

  it('clamps popovers so they stay inside the browser pane', () => {
    const instance = makeInstance();
    const popover = new FakeElement({ left: 0, top: 0, width: 120, height: 100 }) as any;

    setPopoverPosition(instance, popover, 190, 150);

    expect(popover.style.left).toBe('72px');
    expect(popover.style.top).toBe('52px');
    expect(popover.style.maxWidth).toBe('184px');
    expect(popover.style.maxHeight).toBe('144px');
  });

  it('lets the inspect popover move after the drag handle is grabbed', () => {
    const instance = makeInstance();
    const popover = new FakeElement({ left: 40, top: 36, width: 100, height: 60 }) as any;
    const handle = new FakeElement({ left: 40, top: 36, width: 100, height: 20 }) as any;
    const cleanup = enablePopoverDragging(instance, popover, handle);
    const fakeDocument = document as unknown as FakeDocument;

    handle.dispatch('mousedown', {
      button: 0,
      clientX: 60,
      clientY: 52,
      preventDefault: vi.fn(),
    });

    fakeDocument.dispatch('mousemove', {
      clientX: 154,
      clientY: 118,
      preventDefault: vi.fn(),
    });

    expect(popover.style.left).toBe('92px');
    expect(popover.style.top).toBe('92px');
    expect(popover.classList.contains('dragging')).toBe(true);

    fakeDocument.dispatch('mouseup', {});

    expect(popover.classList.contains('dragging')).toBe(false);
    cleanup();
  });
});
