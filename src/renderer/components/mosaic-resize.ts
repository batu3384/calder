import { clampRatio } from './mosaic-layout-model.js';

export type RatioAxis = 'x' | 'y';

interface RatioHandleOptions {
  axis?: RatioAxis;
  min?: number;
  max?: number;
  fallback?: number;
}

interface RatioHandleCallbacks {
  onPreview?: (ratio: number) => void;
  onCommit?: (ratio: number) => void;
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
  callbacks: RatioHandleCallbacks,
  options: RatioHandleOptions = {},
): () => void {
  const axis = options.axis ?? 'x';
  const min = options.min ?? 0.2;
  const max = options.max ?? 0.8;
  const fallback = options.fallback ?? 0.5;

  let onPointerMove: ((event: PointerEvent) => void) | null = null;
  let onPointerUp: ((event: PointerEvent) => void) | null = null;
  let onPointerCancel: ((event: PointerEvent) => void) | null = null;
  let onWindowBlur: (() => void) | null = null;
  let onLostPointerCapture: ((event: PointerEvent) => void) | null = null;
  let activePointerId: number | null = null;

  const matchesActivePointer = (event: Pick<PointerEvent, 'pointerId'>): boolean => {
    if (activePointerId === null) return true;
    return typeof event.pointerId !== 'number' || event.pointerId === activePointerId;
  };

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
    if (onPointerCancel) {
      window.removeEventListener('pointercancel', onPointerCancel);
      onPointerCancel = null;
    }
    if (onWindowBlur) {
      window.removeEventListener('blur', onWindowBlur);
      onWindowBlur = null;
    }
    if (onLostPointerCapture) {
      handle.removeEventListener('lostpointercapture', onLostPointerCapture);
      onLostPointerCapture = null;
    }
    activePointerId = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    const bounds = getBounds();
    let lastRatio = resolvePointerRatio(bounds, event, axis, min, max, fallback);
    activePointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
    handle.classList.add('active');

    onPointerMove = (moveEvent: PointerEvent) => {
      if (!matchesActivePointer(moveEvent)) return;
      lastRatio = resolvePointerRatio(bounds, moveEvent, axis, min, max, fallback);
      callbacks.onPreview?.(lastRatio);
    };

    onPointerUp = (upEvent: PointerEvent) => {
      if (!matchesActivePointer(upEvent)) return;
      lastRatio = resolvePointerRatio(bounds, upEvent, axis, min, max, fallback);
      callbacks.onPreview?.(lastRatio);
      callbacks.onCommit?.(lastRatio);
      stopDragging();
    };

    onPointerCancel = (cancelEvent: PointerEvent) => {
      if (!matchesActivePointer(cancelEvent)) return;
      stopDragging();
    };

    onWindowBlur = () => {
      stopDragging();
    };

    onLostPointerCapture = (lostCaptureEvent: PointerEvent) => {
      if (!matchesActivePointer(lostCaptureEvent)) return;
      stopDragging();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onWindowBlur);
    handle.addEventListener('lostpointercapture', onLostPointerCapture);

    if (activePointerId !== null && typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(activePointerId);
      } catch {
        // Ignore capture failures (e.g., non-primary pointer or unsupported environments).
      }
    }
    event.preventDefault();
  };

  handle.addEventListener('pointerdown', onPointerDown);
  return () => {
    stopDragging();
    handle.removeEventListener('pointerdown', onPointerDown);
  };
}
