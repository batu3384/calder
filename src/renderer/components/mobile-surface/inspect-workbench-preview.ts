import { formatCaptureMeta } from './dependency-scoping.js';
import type { RenderMobileInspectWorkbenchOptions } from './inspect-workbench-types.js';

export function renderInspectPreviewPanel(
  options: RenderMobileInspectWorkbenchOptions,
): HTMLDivElement {
  const { instance, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const preview = document.createElement('div');
  preview.className = 'mobile-surface-inspect-preview';
  if (inspect.screenshot?.dataUrl) {
    const frame = document.createElement('div');
    frame.className = 'mobile-surface-inspect-frame';

    const image = document.createElement('img');
    image.className = 'mobile-surface-inspect-image';
    image.src = inspect.screenshot.dataUrl;
    image.alt = `${platformLabels[inspect.platform]} screenshot`;
    image.addEventListener('click', (event) => {
      if (inspect.interacting) return;
      if (inspect.liveMode) {
        handlers.stopInspectLiveMode(
          instance,
          'Live paused for precise point inspection.',
          'default',
        );
      }
      const rect = image.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const rawX = event.clientX - rect.left;
      const rawY = event.clientY - rect.top;
      const normalizedX = Math.min(1, Math.max(0, rawX / rect.width));
      const normalizedY = Math.min(1, Math.max(0, rawY / rect.height));
      const screenshotWidth = inspect.screenshot?.width ?? Math.round(rect.width);
      const screenshotHeight = inspect.screenshot?.height ?? Math.round(rect.height);
      inspect.selectedPoint = {
        x: Math.round(normalizedX * screenshotWidth),
        y: Math.round(normalizedY * screenshotHeight),
        normalizedX,
        normalizedY,
      };
      inspect.selectedElement = null;
      inspect.inspectingPoint = true;
      const inspectToken = inspect.pointInspectToken + 1;
      inspect.pointInspectToken = inspectToken;
      inspect.sendError = '';
      handlers.setInspectStatus(instance, 'Inspecting selected point…', 'default');
      handlers.rerenderFromState(instance);

      const api = window.calder?.mobileInspect;
      if (!api) {
        inspect.inspectingPoint = false;
        handlers.setInspectStatus(
          instance,
          'Mobile inspect API is unavailable in this build.',
          'error',
        );
        handlers.rerenderFromState(instance);
        return;
      }

      const selectedPoint = inspect.selectedPoint;
      void (async () => {
        try {
          const result = await api.inspectPoint(inspect.platform, selectedPoint.x, selectedPoint.y);
          if (inspect.pointInspectToken !== inspectToken) return;
          inspect.selectedElement = result;
          if (result.success) {
            handlers.setInspectStatus(instance, result.message, 'success');
          } else {
            handlers.setInspectStatus(instance, result.message, 'default');
          }
        } catch (error) {
          if (inspect.pointInspectToken !== inspectToken) {
            return;
          }
          const message = error instanceof Error ? error.message : 'Point inspection failed.';
          inspect.selectedElement = null;
          handlers.setInspectStatus(instance, message, 'error');
        } finally {
          if (inspect.pointInspectToken === inspectToken) {
            inspect.inspectingPoint = false;
            handlers.rerenderFromState(instance);
          }
        }
      })();
    });

    frame.appendChild(image);

    const bounds = inspect.selectedElement?.success
      ? inspect.selectedElement.element?.bounds
      : undefined;
    const screenshotWidth = inspect.screenshot?.width;
    const screenshotHeight = inspect.screenshot?.height;
    if (
      bounds &&
      typeof screenshotWidth === 'number' &&
      screenshotWidth > 0 &&
      typeof screenshotHeight === 'number' &&
      screenshotHeight > 0
    ) {
      const overlay = document.createElement('span');
      overlay.className = 'mobile-surface-inspect-bounds-overlay';
      overlay.style.left = `${(bounds.left / screenshotWidth) * 100}%`;
      overlay.style.top = `${(bounds.top / screenshotHeight) * 100}%`;
      overlay.style.width = `${((bounds.right - bounds.left) / screenshotWidth) * 100}%`;
      overlay.style.height = `${((bounds.bottom - bounds.top) / screenshotHeight) * 100}%`;
      frame.appendChild(overlay);
    }

    if (inspect.selectedPoint) {
      const marker = document.createElement('span');
      marker.className = 'mobile-surface-inspect-marker';
      marker.style.left = `${inspect.selectedPoint.normalizedX * 100}%`;
      marker.style.top = `${inspect.selectedPoint.normalizedY * 100}%`;
      frame.appendChild(marker);
    }

    preview.appendChild(frame);

    const meta = document.createElement('div');
    meta.className = 'mobile-surface-inspect-meta';
    const liveParts: string[] = [formatCaptureMeta(inspect.screenshot) || 'Frame captured'];
    if (inspect.liveMode) {
      liveParts.push(`Live: on (${inspect.liveIntervalMs}ms)`);
      liveParts.push(`Frames: ${inspect.liveFrames}`);
    }
    if (inspect.liveLastFrameAt) {
      liveParts.push(`Last: ${inspect.liveLastFrameAt}`);
    }
    meta.textContent = liveParts.join(' · ');
    preview.appendChild(meta);

    if (inspect.inspectingPoint) {
      const pointLoading = document.createElement('div');
      pointLoading.className = 'mobile-surface-inspect-point-loading';
      pointLoading.textContent = 'Inspecting selected point…';
      preview.appendChild(pointLoading);
    }

    if (inspect.selectedElement) {
      const elementInfo = document.createElement('div');
      elementInfo.className = 'mobile-surface-inspect-element';
      if (inspect.selectedElement.success && inspect.selectedElement.element) {
        const element = inspect.selectedElement.element;
        const lines = [
          element.className ? `Class: ${element.className}` : null,
          element.resourceId ? `Resource ID: ${element.resourceId}` : null,
          element.contentDesc ? `Content description: ${element.contentDesc}` : null,
          element.text ? `Text: ${element.text}` : null,
          element.bounds
            ? `Bounds: [${element.bounds.left},${element.bounds.top}]–[${element.bounds.right},${element.bounds.bottom}]`
            : null,
        ].filter((entry): entry is string => Boolean(entry));
        elementInfo.textContent =
          lines.length > 0 ? lines.join('\n') : inspect.selectedElement.message;
      } else {
        elementInfo.textContent = inspect.selectedElement.message;
      }
      preview.appendChild(elementInfo);
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'mobile-surface-inspect-empty';
    empty.textContent = 'No capture yet. Launch simulator and capture a frame.';
    preview.appendChild(empty);
  }
  return preview;
}
