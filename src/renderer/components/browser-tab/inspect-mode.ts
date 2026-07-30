import { t } from '../../i18n.js';
import {
  escapePromptLiteral,
  formatShadowHostClause,
  sanitizePromptBody,
} from './capture-prompt.js';
import { sendGuestMessage } from './guest-messaging.js';
import { positionPopover } from './popover.js';
import { buildSelectorOptions } from './selector-ui.js';
import {
  formatSelectorVerificationMessage,
  pickInitialActiveSelector,
} from './selector-verification.js';
import type { BrowserTabInstance, ElementInfo, SelectorVerification } from './types.js';
import { getViewportContext } from './viewport.js';

function renderSelectorStatus(
  instance: BrowserTabInstance,
  verification: SelectorVerification | undefined,
): void {
  if (!verification) {
    instance.inspectSelectorStatusEl.textContent = '';
    instance.inspectSelectorStatusEl.style.display = 'none';
    return;
  }

  let message = formatSelectorVerificationMessage(verification);
  if (verification.status === 'ambiguous' && message) {
    message = t(
      'Selector matches {count} elements. Pick a more specific option or use Draw mode.',
    ).replace('{count}', String(verification.matchCount));
  } else if (message) {
    message = t(message);
  }

  instance.inspectSelectorStatusEl.textContent = message ?? '';
  instance.inspectSelectorStatusEl.style.display = message ? 'block' : 'none';
  instance.inspectSelectorStatusEl.dataset.status = verification.status;
}

async function refreshSelectorVerification(instance: BrowserTabInstance): Promise<void> {
  const info = instance.selectedElement;
  if (!info?.captureTargetId) return;

  await sendGuestMessage(instance.webview, 'verify-capture-selector', {
    captureTargetId: info.captureTargetId,
    selector: info.activeSelector.value,
    shadowHostSelectors: info.shadowHostSelectors ?? [],
  });
}

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

export function showElementInfo(
  instance: BrowserTabInstance,
  info: ElementInfo,
  x: number,
  y: number,
): void {
  const activeSelector = pickInitialActiveSelector(info.selectors, info.selectorVerifications);
  instance.selectedElement = {
    ...info,
    activeSelector,
  };
  instance.inspectPanel.style.display = 'flex';
  positionPopover(instance, instance.inspectPanel, x, y);

  const classStr = info.classes.length ? `.${info.classes.join('.')}` : '';
  const idStr = info.id ? `#${info.id}` : '';
  instance.inspectTitleEl.textContent = t(`<${info.tagName}> selected`);
  if (info.liftedFromTag) {
    instance.inspectSubtitleEl.textContent = t(
      'Resolved from <{tag}> to this interactive target.',
    ).replace('{tag}', info.liftedFromTag);
  } else if (info.textContent) {
    instance.inspectSubtitleEl.textContent = t('Target text: {text}').replace(
      '{text}',
      info.textContent,
    );
  } else {
    instance.inspectSubtitleEl.textContent = t(
      `Choose the best selector for this ${info.tagName} element before routing the prompt.`,
    );
  }
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
  selectorLabel.textContent = t('Selector');
  instance.elementInfoEl.appendChild(selectorLabel);

  instance.inspectSelectorStatusEl =
    instance.inspectSelectorStatusEl ?? document.createElement('div');
  instance.inspectSelectorStatusEl.className = 'inspect-selector-status';
  instance.elementInfoEl.appendChild(instance.inspectSelectorStatusEl);
  renderSelectorStatus(instance, info.selectorVerifications?.[activeSelector.value]);

  const selectorOptions = buildSelectorOptions(
    info.selectors,
    activeSelector,
    info.selectorVerifications,
    (sel) => {
      instance.selectedElement!.activeSelector = sel;
      const verifications = instance.selectedElement!.selectorVerifications;
      renderSelectorStatus(instance, verifications?.[sel.value]);
      void refreshSelectorVerification(instance);
    },
  );
  selectorOptions.className = 'inspect-selector-options';
  instance.elementInfoEl.appendChild(selectorOptions);

  instance.instructionInput.value = '';
  instance.instructionInput.focus();
}

export function applyCaptureSelectorVerification(
  instance: BrowserTabInstance,
  payload: {
    captureTargetId: string;
    selector: string;
    verification: SelectorVerification;
  },
): void {
  const info = instance.selectedElement;
  if (!info || info.captureTargetId !== payload.captureTargetId) return;
  if (info.activeSelector.value !== payload.selector) return;

  info.selectorVerifications = {
    ...(info.selectorVerifications ?? {}),
    [payload.selector]: payload.verification,
  };
  renderSelectorStatus(instance, payload.verification);
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

  const pageUrl = escapePromptLiteral(info.pageUrl, 500);
  const selector = escapePromptLiteral(info.activeSelector.value);
  const textClause = info.textContent ? `, text: '${escapePromptLiteral(info.textContent)}'` : '';
  const shadowClause = formatShadowHostClause(info.shadowHostSelectors);
  const safeInstruction = sanitizePromptBody(instruction);
  const verification = info.selectorVerifications?.[info.activeSelector.value];
  const reliabilityHint =
    verification?.status === 'ambiguous'
      ? ', selector reliability: ambiguous'
      : verification?.status === 'missing'
        ? ', selector reliability: missing'
        : '';

  return (
    `Regarding the <${info.tagName}> element at ${pageUrl}${vpCtx} ` +
    `(selector: '${selector}'${textClause}${shadowClause}${clickPoint}${canvasHint}${reliabilityHint}): ${safeInstruction}`
  );
}

export function dismissInspect(instance: BrowserTabInstance): void {
  instance.instructionInput.value = '';
  instance.selectedElement = null;
  instance.inspectTitleEl.textContent = t('Select an element');
  instance.inspectSubtitleEl.textContent = t(
    'Click a page element to capture its selector and send a focused prompt.',
  );
  instance.inspectPanel.style.display = 'none';
  if (instance.inspectMode) {
    toggleInspectMode(instance);
    return;
  }
  instance.syncToolbarState();
}
