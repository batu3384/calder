import type { BrowserTabInstance, ViewportPreset } from './types.js';
import { anchorFloatingSurface } from '../floating-surface.js';
import { logDebugEvent } from '../debug-panel.js';

export function applyViewport(instance: BrowserTabInstance, preset: ViewportPreset): void {
  instance.currentViewport = preset;

  const label = preset.width !== null ? `${preset.width}×${preset.height}` : 'Responsive';
  instance.viewportBtn.textContent = label;
  instance.viewportBtn.classList.toggle('active', preset.width !== null);

  const webviewEl = instance.webview as unknown as HTMLElement;
  if (preset.width !== null) {
    instance.viewportContainer.classList.remove('responsive');
    webviewEl.style.width = `${preset.width}px`;
    webviewEl.style.height = `${preset.height}px`;
    webviewEl.style.flex = 'none';
  } else {
    instance.viewportContainer.classList.add('responsive');
    webviewEl.style.width = '';
    webviewEl.style.height = '';
    webviewEl.style.flex = '';
  }
}

export function openViewportDropdown(instance: BrowserTabInstance, reason = 'programmatic'): void {
  if (instance.viewportDropdown.classList.contains('visible')) return;
  instance.viewportDropdown.classList.add('visible');
  instance.viewportDropdownFloatingCleanup?.();
  instance.viewportDropdownFloatingCleanup = anchorFloatingSurface(
    instance.viewportBtn,
    instance.viewportDropdown,
    {
      placement: 'bottom-end',
      offsetPx: 6,
      maxWidthPx: 260,
      maxHeightPx: 360,
    },
  );
  logDebugEvent('browserMenu', instance.sessionId, {
    menu: 'viewport',
    state: 'open',
    reason,
    currentViewport: instance.currentViewport.label,
  });
}

export function closeViewportDropdown(instance: BrowserTabInstance, reason = 'programmatic'): void {
  const wasOpen = instance.viewportDropdown.classList.contains('visible');
  instance.viewportDropdown.classList.remove('visible');
  instance.viewportDropdownFloatingCleanup?.();
  instance.viewportDropdownFloatingCleanup = null;
  if (wasOpen) {
    logDebugEvent('browserMenu', instance.sessionId, {
      menu: 'viewport',
      state: 'close',
      reason,
      currentViewport: instance.currentViewport.label,
    });
  }
}

export function getViewportContext(instance: BrowserTabInstance, include: boolean): string {
  if (!include) return '';
  const vp = instance.currentViewport;
  if (vp.width !== null) {
    return ` [viewport: ${vp.width}×${vp.height} – ${vp.label}]`;
  }
  const el = instance.webview as unknown as HTMLElement;
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (!w || !h) return '';
  return ` [viewport: ${w}×${h} – Responsive]`;
}
