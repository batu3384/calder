import type { BrowserTabInstance, ElementInfo } from './types.js';
import { buildSelectorOptions } from './selector-ui.js';
import { positionPopover } from './popover.js';
import { getViewportContext } from './viewport.js';
import { sendGuestMessage } from './guest-messaging.js';

export function toggleInspectMode(instance: BrowserTabInstance): void {
  instance.inspectMode = !instance.inspectMode;
  instance.inspectBtn.classList.toggle('active', instance.inspectMode);
  instance.recordBtn.disabled = instance.inspectMode;
  instance.drawBtn.disabled = instance.inspectMode;
  if (instance.inspectMode) {
    void sendGuestMessage(instance.webview, 'enter-inspect-mode');
  } else {
    void sendGuestMessage(instance.webview, 'exit-inspect-mode');
    instance.selectedElement = null;
    instance.inspectPanel.style.display = 'none';
  }
  instance.syncToolbarState();
}

export function showElementInfo(instance: BrowserTabInstance, info: ElementInfo, x: number, y: number): void {
  instance.selectedElement = info;
  instance.inspectPanel.style.display = 'flex';
  positionPopover(instance, instance.inspectPanel, x, y);

  const classStr = info.classes.length ? `.${info.classes.join('.')}` : '';
  const idStr = info.id ? `#${info.id}` : '';
  instance.inspectTitleEl.textContent = `<${info.tagName}> selected`;
  instance.inspectSubtitleEl.textContent = info.textContent
    ? `Target text: ${info.textContent}`
    : `Choose the best selector for this ${info.tagName} element before routing the prompt.`;
  instance.elementInfoEl.innerHTML = '';

  const tagLine = document.createElement('div');
  tagLine.className = 'inspect-tag-line';
  tagLine.textContent = `<${info.tagName}${idStr}${classStr}>`;
  instance.elementInfoEl.appendChild(tagLine);

  if (info.textContent) {
    const textLine = document.createElement('div');
    textLine.className = 'inspect-text-line';
    textLine.textContent = info.textContent;
    instance.elementInfoEl.appendChild(textLine);
  }

  const selectorLabel = document.createElement('div');
  selectorLabel.className = 'inspect-selector-label';
  selectorLabel.textContent = 'Selector';
  instance.elementInfoEl.appendChild(selectorLabel);

  const selectorOptions = buildSelectorOptions(
    info.selectors,
    info.activeSelector,
    (sel) => { instance.selectedElement!.activeSelector = sel; }
  );
  selectorOptions.className = 'inspect-selector-options';
  instance.elementInfoEl.appendChild(selectorOptions);

  instance.instructionInput.value = '';
  instance.instructionInput.focus();
}

export function buildPrompt(instance: BrowserTabInstance): string | null {
  const info = instance.selectedElement;
  if (!info) return null;
  const instruction = instance.instructionInput.value.trim();
  if (!instruction) return null;

  const vpCtx = getViewportContext(instance, instance.inspectAttachDimsCheckbox.checked);
  const clickPoint = info.clickPoint
    ? `, point: '${Math.round(info.clickPoint.normalizedX * 100)}% x ${Math.round(info.clickPoint.normalizedY * 100)}%'`
    : '';
  const canvasHint = info.isCanvasLike ? ', surface: canvas-like element' : '';

  return (
    `Regarding the <${info.tagName}> element at ${info.pageUrl}${vpCtx} ` +
    `(selector: '${info.activeSelector.value}'` +
    (info.textContent ? `, text: '${info.textContent}'` : '') +
    `${clickPoint}${canvasHint}): ${instruction}`
  );
}

export function dismissInspect(instance: BrowserTabInstance): void {
  instance.instructionInput.value = '';
  instance.selectedElement = null;
  instance.inspectTitleEl.textContent = 'Select an element';
  instance.inspectSubtitleEl.textContent = 'Click a page element to capture its selector and send a focused prompt.';
  instance.inspectPanel.style.display = 'none';
  if (instance.inspectMode) {
    toggleInspectMode(instance);
    return;
  }
  instance.syncToolbarState();
}
