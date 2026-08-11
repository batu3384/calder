export interface RailResizeOptions {
  handle: HTMLElement;
  isEnabled: () => boolean;
  readHeight: () => number;
  applyHeight: (height: number) => void;
  syncCanvasSize: () => void;
  minHeight: number;
  maxHeight: number;
}

export function bindRailResize(options: RailResizeOptions): () => void {
  const { handle } = options;
  let dragging = false;
  let startY = 0;
  let startHeight = options.readHeight();
  const resize = (height: number): void => {
    options.applyHeight(height);
    options.syncCanvasSize();
  };
  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    resize(startHeight + (event.clientY - startY));
  };
  const onUp = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {}
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
  const onDown = (event: PointerEvent): void => {
    if (!options.isEnabled()) return;
    event.preventDefault();
    dragging = true;
    startY = event.clientY;
    startHeight = options.readHeight();
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!options.isEnabled()) return;
    const current = options.readHeight();
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      resize(current - 20);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      resize(current + 20);
    } else if (event.key === 'Home') {
      event.preventDefault();
      resize(options.minHeight);
    } else if (event.key === 'End') {
      event.preventDefault();
      resize(options.maxHeight);
    }
  };

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('keydown', onKeyDown);
  return () => {
    dragging = false;
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    handle.removeEventListener('pointerdown', onDown);
    handle.removeEventListener('keydown', onKeyDown);
  };
}
