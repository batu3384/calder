interface ComposerPositionOptions {
  paneEl: HTMLElement;
  composerEl: HTMLElement;
  left: number;
  top: number;
}

interface ComposerPointerPositionOptions {
  paneEl: HTMLElement;
  composerEl: HTMLElement;
  event: Pick<PointerEvent, 'clientX' | 'clientY'>;
}

interface ComposerDraggingOptions {
  paneEl: HTMLElement;
  composerEl: HTMLElement;
  handleEl: HTMLElement;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function setComposerPosition(options: ComposerPositionOptions): void {
  const { paneEl, composerEl, left, top } = options;
  const paneRect = paneEl.getBoundingClientRect();
  const composerRect = composerEl.getBoundingClientRect();
  const maxLeft = Math.max(8, paneRect.width - composerRect.width - 8);
  const maxTop = Math.max(8, paneRect.height - composerRect.height - 8);
  composerEl.style.left = `${clamp(left, 8, maxLeft)}px`;
  composerEl.style.top = `${clamp(top, 8, maxTop)}px`;
}

export function positionComposerNearPointer(options: ComposerPointerPositionOptions): void {
  const { paneEl, composerEl, event } = options;
  const paneRect = paneEl.getBoundingClientRect();
  setComposerPosition({
    paneEl,
    composerEl,
    left: event.clientX - paneRect.left + 12,
    top: event.clientY - paneRect.top + 12,
  });
}

export function enableComposerDragging(options: ComposerDraggingOptions): () => void {
  const { paneEl, composerEl, handleEl } = options;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    composerEl.classList.remove('dragging');
    handleEl.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDragging);
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragging) return;
    const paneRect = paneEl.getBoundingClientRect();
    setComposerPosition({
      paneEl,
      composerEl,
      left: event.clientX - paneRect.left - offsetX,
      top: event.clientY - paneRect.top - offsetY,
    });
    event.preventDefault?.();
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const composerRect = composerEl.getBoundingClientRect();
    offsetX = event.clientX - composerRect.left;
    offsetY = event.clientY - composerRect.top;
    dragging = true;
    composerEl.classList.add('dragging');
    handleEl.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDragging);
    event.preventDefault?.();
  };

  handleEl.addEventListener('mousedown', onMouseDown);
  return () => {
    stopDragging();
    (
      handleEl as unknown as {
        removeEventListener?: (type: string, listener: (event: MouseEvent) => void) => void;
      }
    ).removeEventListener?.('mousedown', onMouseDown);
  };
}
