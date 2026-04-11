import { clampRatio } from './mosaic-layout-model.js';

export type RatioAxis = 'x' | 'y';

interface RatioHandleOptions {
  axis?: RatioAxis;
  min?: number;
  max?: number;
  fallback?: number;
}

export function resolvePointerRatio(
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  axis: RatioAxis,
  min = 0.2,
  max = 0.8,
  fallback = 0.5,
): number {
  const size = axis === 'x' ? bounds.width : bounds.height;
  if (!size) return fallback;
  const origin = axis === 'x' ? bounds.left : bounds.top;
  const coordinate = axis === 'x' ? event.clientX : event.clientY;
  return clampRatio((coordinate - origin) / size, min, max, fallback);
}

export function attachRatioHandle(
  handle: HTMLElement,
  getBounds: () => DOMRect,
  onRatio: (ratio: number) => void,
  options: RatioHandleOptions = {},
): () => void {
  const axis = options.axis ?? 'x';
  const min = options.min ?? 0.2;
  const max = options.max ?? 0.8;
  const fallback = options.fallback ?? 0.5;

  let onPointerMove: ((event: PointerEvent) => void) | null = null;
  let onPointerUp: ((event: PointerEvent) => void) | null = null;

  const stopDragging = () => {
    handle.classList.remove('active');
    if (onPointerMove) {
      window.removeEventListener('pointermove', onPointerMove);
      onPointerMove = null;
    }
    if (onPointerUp) {
      window.removeEventListener('pointerup', onPointerUp);
      onPointerUp = null;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    const bounds = getBounds();
    handle.classList.add('active');

    onPointerMove = (moveEvent: PointerEvent) => {
      onRatio(resolvePointerRatio(bounds, moveEvent, axis, min, max, fallback));
    };
    onPointerUp = () => {
      stopDragging();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    event.preventDefault();
  };

  handle.addEventListener('pointerdown', onPointerDown);
  return () => {
    stopDragging();
    handle.removeEventListener('pointerdown', onPointerDown);
  };
}
