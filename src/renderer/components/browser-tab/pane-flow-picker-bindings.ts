import { dismissFlowPicker } from './flow-picker.js';
import { addFlowStep } from './flow-recording.js';
import { sendGuestMessage } from './guest-messaging.js';
import { pickInitialActiveSelector } from './selector-verification.js';
import type { BrowserTabInstance, FlowPickerAction, FlowReplayPayload } from './types.js';

export function bindFlowPickerInteractions(
  instance: BrowserTabInstance,
  flowPickerMenu: HTMLElement,
  flowPickerOverlay: HTMLElement,
): void {
  flowPickerMenu.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('.flow-picker-item');
    if (!item || !instance.flowPickerPending) return;
    const action = item.dataset['action'] as FlowPickerAction;
    const metadata = instance.flowPickerPending;
    dismissFlowPicker(instance);
    if (action === 'click' || action === 'click-and-record') {
      const selectorValues = metadata.selectorValues?.length
        ? metadata.selectorValues
        : metadata.selectors
            .map((selector) => selector.value)
            .filter((value) => value.trim().length > 0);
      const replayPayload: FlowReplayPayload = {
        selectors: selectorValues,
        shadowHostSelectors: metadata.shadowHostSelectors,
        clickPoint: metadata.clickPoint,
        isCanvasLike: metadata.isCanvasLike,
        tagName: metadata.tagName,
      };
      void sendGuestMessage(instance.webview, 'flow-do-click', replayPayload);
    }
    if (action === 'record' || action === 'click-and-record') {
      addFlowStep(instance, {
        type: action === 'record' ? 'expect' : 'click',
        tagName: metadata.tagName,
        textContent: metadata.textContent,
        selectors: metadata.selectors,
        selectorVerifications: metadata.selectorVerifications,
        activeSelector: pickInitialActiveSelector(
          metadata.selectors,
          metadata.selectorVerifications,
        ),
        shadowHostSelectors: metadata.shadowHostSelectors,
        clickPoint: metadata.clickPoint,
        isCanvasLike: metadata.isCanvasLike,
        pageUrl: metadata.pageUrl,
      });
    }
  });

  flowPickerOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === flowPickerOverlay) dismissFlowPicker(instance);
  });
}
