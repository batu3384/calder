import type { ViewportMenuFocusMode } from './pane-interactions.js';
import { type BrowserTabInstance, VIEWPORT_PRESETS } from './types.js';
import { applyViewport, closeViewportDropdown, openViewportDropdown } from './viewport.js';

interface BrowserViewportMenuControllerOptions {
  instance: BrowserTabInstance;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  customItem: HTMLButtonElement;
  customForm: HTMLDivElement;
}

export interface BrowserViewportMenuController {
  viewportMenuItems: HTMLButtonElement[];
  openViewportMenu(reason?: string, focusMode?: ViewportMenuFocusMode): void;
  closeViewportMenu(reason?: string, returnFocus?: boolean): void;
}

export function createBrowserViewportMenuController(
  options: BrowserViewportMenuControllerOptions,
): BrowserViewportMenuController {
  const { instance, viewportBtn, viewportDropdown, customItem, customForm } = options;

  const viewportMenuItems: HTMLButtonElement[] = [];

  const focusViewportMenuItem = (index: number): void => {
    if (viewportMenuItems.length === 0) return;
    const normalized =
      ((index % viewportMenuItems.length) + viewportMenuItems.length) % viewportMenuItems.length;
    viewportMenuItems.forEach((item) => {
      item.tabIndex = -1;
    });
    const nextItem = viewportMenuItems[normalized];
    nextItem.tabIndex = 0;
    nextItem.focus();
  };

  const focusSelectedViewportMenuItem = (): void => {
    const selectedIndex = viewportMenuItems.findIndex(
      (item) => item.getAttribute('aria-checked') === 'true',
    );
    focusViewportMenuItem(selectedIndex >= 0 ? selectedIndex : 0);
  };

  function openViewportMenu(
    reason = 'programmatic',
    focusMode: ViewportMenuFocusMode = 'selected',
  ): void {
    const showCustomForm = instance.currentViewport.label === 'Custom';
    customForm.style.display = showCustomForm ? 'flex' : 'none';
    customItem.setAttribute('aria-expanded', String(showCustomForm));
    openViewportDropdown(instance, reason);
    if (focusMode === 'none') return;
    requestAnimationFrame(() => {
      if (focusMode === 'first') {
        focusViewportMenuItem(0);
        return;
      }
      if (focusMode === 'last') {
        focusViewportMenuItem(viewportMenuItems.length - 1);
        return;
      }
      focusSelectedViewportMenuItem();
    });
  }

  function closeViewportMenu(reason = 'programmatic', returnFocus = false): void {
    closeViewportDropdown(instance, reason);
    customForm.style.display = 'none';
    customItem.setAttribute('aria-expanded', 'false');
    viewportMenuItems.forEach((item) => {
      item.tabIndex = -1;
    });
    if (returnFocus) {
      requestAnimationFrame(() => viewportBtn.focus());
    }
  }

  for (const preset of VIEWPORT_PRESETS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'browser-viewport-item';
    item.dataset.viewportKey = preset.label;
    item.textContent =
      preset.width !== null ? `${preset.label} — ${preset.width}×${preset.height}` : preset.label;
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', 'false');
    item.tabIndex = -1;
    item.addEventListener('click', () => {
      applyViewport(instance, preset);
      closeViewportMenu('preset-select');
    });
    viewportMenuItems.push(item);
    viewportDropdown.appendChild(item);
  }

  customItem.tabIndex = -1;
  viewportMenuItems.push(customItem);
  viewportDropdown.appendChild(customItem);
  viewportDropdown.appendChild(customForm);

  return {
    viewportMenuItems,
    openViewportMenu,
    closeViewportMenu,
  };
}
