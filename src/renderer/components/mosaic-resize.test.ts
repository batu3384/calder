import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowListeners = new Map<string, Set<(event: any) => void>>();

vi.stubGlobal('window', {
  addEventListener: vi.fn((type: string, listener: (event: any) => void) => {
    const bucket = windowListeners.get(type) ?? new Set<(event: any) => void>();
    bucket.add(listener);
    windowListeners.set(type, bucket);
  }),
  removeEventListener: vi.fn((type: string, listener: (event: any) => void) => {
    windowListeners.get(type)?.delete(listener);
  }),
});

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

class FakeHandle {
  classList = new FakeClassList();
  private listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const bucket = this.listeners.get(type) ?? new Set<(event: any) => void>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function emitWindow(type: string, event: any): void {
  for (const listener of windowListeners.get(type) ?? []) {
    listener(event);
  }
}

import { attachRatioHandle, resolvePointerRatio } from './mosaic-resize.js';

beforeEach(() => {
  vi.clearAllMocks();
  windowListeners.clear();
});

describe('mosaic-resize', () => {
  it('resolves a clamped horizontal ratio from pointer coordinates', () => {
    expect(
      resolvePointerRatio(
        { left: 100, top: 20, width: 400, height: 300 } as DOMRect,
        { clientX: 260, clientY: 20 } as PointerEvent,
        'x',
        0.25,
        0.7,
        0.38,
      ),
    ).toBeCloseTo(0.4, 4);

    expect(
      resolvePointerRatio(
        { left: 100, top: 20, width: 400, height: 300 } as DOMRect,
        { clientX: 900, clientY: 20 } as PointerEvent,
        'x',
        0.25,
        0.7,
        0.38,
      ),
    ).toBe(0.7);
  });

  it('resolves a clamped vertical ratio from pointer coordinates', () => {
    expect(
      resolvePointerRatio(
        { left: 0, top: 200, width: 500, height: 400 } as DOMRect,
        { clientX: 0, clientY: 320 } as PointerEvent,
        'y',
        0.2,
        0.8,
        0.5,
      ),
    ).toBeCloseTo(0.3, 4);

    expect(
      resolvePointerRatio(
        { left: 0, top: 200, width: 500, height: 400 } as DOMRect,
        { clientX: 0, clientY: 900 } as PointerEvent,
        'y',
        0.2,
        0.8,
        0.5,
      ),
    ).toBe(0.8);
  });

  it('binds pointer dragging, emits ratios, and tears listeners down on pointerup', () => {
    const handle = new FakeHandle();
    const onRatio = vi.fn();
    const preventDefault = vi.fn();

    const cleanup = attachRatioHandle(
      handle as unknown as HTMLElement,
      () => ({ left: 100, top: 20, width: 400, height: 300 } as DOMRect),
      onRatio,
      { axis: 'x', min: 0.25, max: 0.7, fallback: 0.38 },
    );

    handle.dispatch('pointerdown', { clientX: 220, clientY: 20, preventDefault });
    emitWindow('pointermove', { clientX: 300, clientY: 20 });
    emitWindow('pointermove', { clientX: 1000, clientY: 20 });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(handle.classList.contains('active')).toBe(true);
    expect(onRatio).toHaveBeenNthCalledWith(1, 0.5);
    expect(onRatio).toHaveBeenNthCalledWith(2, 0.7);

    emitWindow('pointerup', {});

    expect(handle.classList.contains('active')).toBe(false);
    expect(windowListeners.get('pointermove')?.size ?? 0).toBe(0);

    cleanup();
    expect(windowListeners.get('pointerup')?.size ?? 0).toBe(0);
  });
});
