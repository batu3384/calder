import { describe, expect, it, vi } from 'vitest';

import { bindRailResize } from './rail-resize.js';

describe('Pixel Office rail resize', () => {
  it('applies keyboard resize only while rail is enabled', () => {
    const listeners = new Map<string, EventListener>();
    const handle = {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement;
    let height = 200;
    const applyHeight = vi.fn((next: number) => {
      height = next;
    });
    const syncCanvasSize = vi.fn();
    let enabled = false;
    const cleanup = bindRailResize({
      handle,
      isEnabled: () => enabled,
      readHeight: () => height,
      applyHeight,
      syncCanvasSize,
      minHeight: 140,
      maxHeight: 480,
    });

    const keydown = listeners.get('keydown')!;
    const event = (key: string) => ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    keydown(event('ArrowUp'));
    expect(applyHeight).not.toHaveBeenCalled();

    enabled = true;
    keydown(event('ArrowUp'));
    expect(applyHeight).toHaveBeenCalledWith(180);
    expect(syncCanvasSize).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
