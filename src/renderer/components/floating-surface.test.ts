import { describe, expect, it, vi } from 'vitest';

vi.mock('@floating-ui/dom', () => ({
  autoUpdate: vi.fn((_reference, _floating, update) => {
    update();
    return () => undefined;
  }),
  computePosition: vi.fn(async () => ({ x: 12, y: 24 })),
  flip: vi.fn((value) => ({ name: 'flip', options: value })),
  offset: vi.fn((value) => ({ name: 'offset', options: value })),
  shift: vi.fn((value) => ({ name: 'shift', options: value })),
  size: vi.fn((value) => ({ name: 'size', options: value })),
}));

describe('floating-surface', () => {
  it('positions a floating element and returns cleanup', async () => {
    const reference = {} as HTMLElement;
    const floating = { style: {} } as HTMLElement;
    const { anchorFloatingSurface } = await import('./floating-surface.js');

    const cleanup = anchorFloatingSurface(reference, floating);
    await Promise.resolve();

    expect(floating.style.left).toBe('12px');
    expect(floating.style.top).toBe('24px');
    expect(typeof cleanup).toBe('function');
  });
});
