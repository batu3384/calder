import type { BrowserTabInstance } from './types.js';

function clampPopoverPosition(
  instance: BrowserTabInstance,
  popover: HTMLElement,
  left: number,
  top: number,
): { left: number; top: number } {
  const paneRect = instance.element.getBoundingClientRect();
  const paneWidth = paneRect.width;
  const paneHeight = paneRect.height;

  // Constrain the popover's rendered size to the pane so it never exceeds
  // the available space (which would otherwise be clipped by the pane's
  // overflow: hidden). Override CSS min-width so it can shrink on narrow panes.
  popover.style.minWidth = '0';
  popover.style.maxWidth = `${Math.max(0, paneWidth - 16)}px`;
  popover.style.maxHeight = `${Math.max(0, paneHeight - 16)}px`;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  const rect = popover.getBoundingClientRect();
  if (left + rect.width > paneWidth) left = paneWidth - rect.width - 8;
  if (top + rect.height > paneHeight) top = paneHeight - rect.height - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  return { left, top };
}

export function setPopoverPosition(
  instance: BrowserTabInstance,
  popover: HTMLElement,
  left: number,
  top: number,
): { left: number; top: number } {
  const next = clampPopoverPosition(instance, popover, left, top);
  popover.style.left = `${next.left}px`;
  popover.style.top = `${next.top}px`;
  return next;
}

/**
 * Position a popover element at webview-local (x, y), translating to pane-local
 * coordinates and clamping within the pane bounds. The popover must already be
 * visible so its rendered size can be measured.
 */
export function positionPopover(
  instance: BrowserTabInstance,
  popover: HTMLElement,
  x: number,
  y: number,
): void {
  const webviewRect = (instance.webview as unknown as HTMLElement).getBoundingClientRect();
  const paneRect = instance.element.getBoundingClientRect();
  const left = webviewRect.left - paneRect.left + x;
  const top = webviewRect.top - paneRect.top + y;
  setPopoverPosition(instance, popover, left, top);
}

export function enablePopoverDragging(
  instance: BrowserTabInstance,
  popover: HTMLElement,
  handle: HTMLElement = popover,
): () => void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    popover.classList.remove('dragging');
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDragging);
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragging) return;
    const paneRect = instance.element.getBoundingClientRect();
    setPopoverPosition(
      instance,
      popover,
      event.clientX - paneRect.left - offsetX,
      event.clientY - paneRect.top - offsetY,
    );
    event.preventDefault?.();
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const popoverRect = popover.getBoundingClientRect();
    offsetX = event.clientX - popoverRect.left;
    offsetY = event.clientY - popoverRect.top;
    dragging = true;
    popover.classList.add('dragging');
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDragging);
    event.preventDefault?.();
  };

  handle.addEventListener('mousedown', onMouseDown);

  return () => {
    stopDragging();
    handle.removeEventListener('mousedown', onMouseDown);
  };
}
