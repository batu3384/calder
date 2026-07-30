/**
 * Preload script injected into browser-tab <webview> guests.
 * Provides DOM element inspection: hover highlight, click to select,
 * and sends element metadata back to the host renderer via ipcRenderer.sendToHost().
 */
import { ipcRenderer } from 'electron';

import { isCrossOriginFrameElement } from './browser-tab-capture-guards';
import { getElementMetadata, verifyCaptureSelector } from './browser-tab-element-metadata';
import { replayFlowClick } from './browser-tab-flow-replay';
import {
  type AuthFillPayload,
  fillCredentialsAcrossDocuments,
} from './browser-tab-preload-auth-fill';
import { createBrowserTabDrawMode } from './browser-tab-preload-draw';
// Contract marker for preload source-based tests:
// escapeCssIdentifier, escapeCssAttributeValue are now resolved in browser-tab-element-metadata.ts.

type BrowserGuestOpenSource = 'anchor' | 'window-open';

interface BrowserGuestOpenPayload {
  url: string;
  source: BrowserGuestOpenSource;
}

function shouldRouteBrowserOpenIntent(input: {
  targetAttr?: string | null;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  const target = (input.targetAttr || '').trim().toLowerCase();
  if (target === '_blank') return true;
  if (input.button === 1) return true;
  if (input.metaKey || input.ctrlKey || input.shiftKey) return true;
  return false;
}

const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'file:']);

function resolveBrowserGuestOpenPayload(
  requestedUrl: string,
  baseUrl: string,
  source: BrowserGuestOpenSource,
): BrowserGuestOpenPayload | null {
  const trimmed = requestedUrl.trim();
  if (!trimmed) return null;

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (BLOCKED_PROTOCOLS.has(resolved.protocol)) {
      return null;
    }
    return {
      url: resolved.href,
      source,
    };
  } catch {
    return null;
  }
}

let inspectMode = false;
let flowMode = false;
let suppressNextFlowClick = false;
const highlightOverlays = new Map<Document, HTMLDivElement>();

function sendBrowserOpenRequest(
  requestedUrl: string,
  source: BrowserGuestOpenSource,
  baseUrl = window.location.href,
): void {
  const payload = resolveBrowserGuestOpenPayload(requestedUrl, baseUrl, source);
  if (!payload) return;
  ipcRenderer.sendToHost('browser-open-request', payload);
}

function findPopupAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  return anchor;
}

function isOverlayElement(el: Element): boolean {
  return el.getAttribute('data-calder-overlay') === 'true';
}

function resolveEventElementTarget(e: Event): Element | null {
  const composedPath = typeof e.composedPath === 'function' ? e.composedPath() : [];
  for (const node of composedPath) {
    if (node instanceof Element && !isOverlayElement(node)) return node;
  }
  const target = e.target;
  if (target instanceof Element && !isOverlayElement(target)) return target;
  return null;
}

function collectSameOriginFrameDocuments(rootDocument: Document): Document[] {
  const docs: Document[] = [];
  const visited = new Set<Document>();

  const visit = (doc: Document): void => {
    if (visited.has(doc)) return;
    visited.add(doc);
    docs.push(doc);

    for (const frameNode of doc.querySelectorAll('iframe,frame')) {
      const frame = frameNode as HTMLIFrameElement | HTMLFrameElement;
      try {
        const childDoc = frame.contentDocument;
        if (childDoc) visit(childDoc);
      } catch {
        // Cross-origin frames are intentionally skipped.
      }
    }
  };

  visit(rootDocument);
  return docs;
}

function updateDocumentCursor(doc: Document, active: boolean): void {
  if (!doc.body) return;
  doc.body.style.cursor = active ? 'crosshair' : '';
}

function ensureOverlay(doc: Document): HTMLDivElement {
  const existing = highlightOverlays.get(doc);
  if (existing) return existing;

  const overlay = doc.createElement('div');
  overlay.setAttribute('data-calder-overlay', 'true');
  overlay.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483647;' +
    'border:2px solid #4a9eff;background:rgba(74,158,255,0.15);' +
    'transition:all 0.05s ease;display:none;';
  doc.documentElement.appendChild(overlay);
  highlightOverlays.set(doc, overlay);
  return overlay;
}

function positionOverlay(el: Element): void {
  const doc = el.ownerDocument;
  const overlay = ensureOverlay(doc);
  const rect = el.getBoundingClientRect();
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.display = 'block';
}

function hideOverlay(doc?: Document): void {
  if (doc) {
    const overlay = highlightOverlays.get(doc);
    if (overlay) overlay.style.display = 'none';
    return;
  }

  for (const overlay of highlightOverlays.values()) {
    overlay.style.display = 'none';
  }
}

function fillCredentialsAcrossFrames(payload: AuthFillPayload): {
  filledUsername: boolean;
  filledPassword: boolean;
} {
  return fillCredentialsAcrossDocuments(collectSameOriginFrameDocuments(document), payload);
}

function onMouseOver(e: MouseEvent): void {
  if (!inspectMode && !flowMode) return;
  const target = resolveEventElementTarget(e);
  if (!target) return;
  positionOverlay(target);
}

function onMouseOut(e: MouseEvent): void {
  if (!inspectMode && !flowMode) return;
  const targetDoc = resolveEventElementTarget(e)?.ownerDocument;
  hideOverlay(targetDoc);
  if (!targetDoc) hideOverlay();
}

function notifyCrossOriginCaptureBlocked(): void {
  ipcRenderer.sendToHost('inspect-cross-origin-blocked');
}

function onClick(e: MouseEvent): void {
  if (!inspectMode) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const target = resolveEventElementTarget(e);
  if (!target) return;
  if (isCrossOriginFrameElement(target)) {
    notifyCrossOriginCaptureBlocked();
    return;
  }
  const metadata = getElementMetadata(target, { clientX: e.clientX, clientY: e.clientY });
  ipcRenderer.sendToHost('element-selected', { metadata, x: e.clientX, y: e.clientY });
}

function onPopupAnchorClick(e: MouseEvent): void {
  if (inspectMode || flowMode || browserDrawMode.isActive() || e.defaultPrevented) return;
  const target = resolveEventElementTarget(e);
  const anchor = findPopupAnchor(target);
  if (!anchor) return;
  if (
    !shouldRouteBrowserOpenIntent({
      targetAttr: anchor.getAttribute('target'),
      button: e.button,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    })
  ) {
    return;
  }
  const href = anchor.getAttribute('href') || anchor.href;
  if (!href) return;
  e.preventDefault();
  const baseUrl = anchor.ownerDocument.defaultView?.location.href || window.location.href;
  sendBrowserOpenRequest(href, 'anchor', baseUrl);
}

function onFlowClick(e: MouseEvent): void {
  if (!flowMode) return;
  if (suppressNextFlowClick) {
    suppressNextFlowClick = false;
    return;
  }
  const target = resolveEventElementTarget(e);
  if (!target) return;
  if (isCrossOriginFrameElement(target)) {
    notifyCrossOriginCaptureBlocked();
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  ipcRenderer.sendToHost('flow-element-picked', {
    metadata: getElementMetadata(target, { clientX: e.clientX, clientY: e.clientY }),
    x: e.clientX,
    y: e.clientY,
  });
}

const inspectListenerDocs = new Set<Document>();
const flowListenerDocs = new Set<Document>();

function addInspectListeners(doc: Document): void {
  if (inspectListenerDocs.has(doc)) return;
  doc.addEventListener('mouseover', onMouseOver, true);
  doc.addEventListener('mouseout', onMouseOut, true);
  doc.addEventListener('click', onClick, true);
  inspectListenerDocs.add(doc);
  updateDocumentCursor(doc, true);
}

function removeInspectListeners(): void {
  for (const doc of inspectListenerDocs) {
    doc.removeEventListener('mouseover', onMouseOver, true);
    doc.removeEventListener('mouseout', onMouseOut, true);
    doc.removeEventListener('click', onClick, true);
    updateDocumentCursor(doc, false);
  }
  inspectListenerDocs.clear();
}

function syncInspectListeners(): void {
  for (const doc of collectSameOriginFrameDocuments(document)) {
    addInspectListeners(doc);
  }
}

function addFlowListeners(doc: Document): void {
  if (flowListenerDocs.has(doc)) return;
  doc.addEventListener('mouseover', onMouseOver, true);
  doc.addEventListener('mouseout', onMouseOut, true);
  doc.addEventListener('click', onFlowClick, true);
  flowListenerDocs.add(doc);
  updateDocumentCursor(doc, true);
}

function removeFlowListeners(): void {
  for (const doc of flowListenerDocs) {
    doc.removeEventListener('mouseover', onMouseOver, true);
    doc.removeEventListener('mouseout', onMouseOut, true);
    doc.removeEventListener('click', onFlowClick, true);
    updateDocumentCursor(doc, false);
  }
  flowListenerDocs.clear();
}

function syncFlowListeners(): void {
  for (const doc of collectSameOriginFrameDocuments(document)) {
    addFlowListeners(doc);
  }
}

function onFrameLoadCapture(e: Event): void {
  const target = e.target;
  if (!(target instanceof HTMLIFrameElement || target instanceof HTMLFrameElement)) return;
  if (inspectMode) syncInspectListeners();
  if (flowMode) syncFlowListeners();
}

document.addEventListener('load', onFrameLoadCapture, true);

function exitInspectMode(): void {
  inspectMode = false;
  removeInspectListeners();
  hideOverlay();
  document.documentElement.dataset.calderInspectMode = 'off';
}

const browserDrawMode = createBrowserTabDrawMode({
  exitInspectMode,
  exitFlowMode: () => exitFlowMode(),
});

function enterFlowMode(): void {
  if (inspectMode) exitInspectMode();
  if (browserDrawMode.isActive()) browserDrawMode.exitDrawMode();
  flowMode = true;
  syncFlowListeners();
}

function enterInspectMode(): void {
  if (flowMode) exitFlowMode();
  if (browserDrawMode.isActive()) browserDrawMode.exitDrawMode();
  inspectMode = true;
  syncInspectListeners();
  document.documentElement.dataset.calderInspectMode = 'on';
}

function exitFlowMode(): void {
  flowMode = false;
  removeFlowListeners();
  hideOverlay();
}

ipcRenderer.on('enter-inspect-mode', () => enterInspectMode());
ipcRenderer.on('exit-inspect-mode', () => exitInspectMode());
ipcRenderer.on('enter-flow-mode', () => enterFlowMode());
ipcRenderer.on('exit-flow-mode', () => exitFlowMode());
ipcRenderer.on('enter-draw-mode', () => browserDrawMode.enterDrawMode());
ipcRenderer.on('exit-draw-mode', () => browserDrawMode.exitDrawMode());
ipcRenderer.on('draw-clear', () => browserDrawMode.clearDrawing());
ipcRenderer.on('flow-do-click', (_event, payload: unknown) => {
  void replayFlowClick(payload, {
    suppressRecording: () => {
      suppressNextFlowClick = true;
    },
  });
});
ipcRenderer.on('auth-fill-credentials', (_event, payload: AuthFillPayload) => {
  const result = fillCredentialsAcrossFrames(payload);
  ipcRenderer.sendToHost('auth-fill-result', result);
});
ipcRenderer.on('verify-capture-selector', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') return;
  const record = payload as Record<string, unknown>;
  const captureTargetId = typeof record.captureTargetId === 'string' ? record.captureTargetId : '';
  const selector = typeof record.selector === 'string' ? record.selector : '';
  const shadowHostSelectors = Array.isArray(record.shadowHostSelectors)
    ? (record.shadowHostSelectors as string[][])
    : [];
  const verification = verifyCaptureSelector({
    captureTargetId,
    selector,
    shadowHostSelectors,
  });
  ipcRenderer.sendToHost('capture-selector-verified', {
    captureTargetId,
    selector,
    verification,
  });
});

document.addEventListener('click', onPopupAnchorClick, true);
document.addEventListener('auxclick', onPopupAnchorClick, true);

window.open = ((url?: string | URL, target?: string) => {
  const requestedUrl = typeof url === 'string' ? url : (url?.toString() ?? '');
  if (!requestedUrl) return null;

  const targetValue = (target || '').trim().toLowerCase();
  const payload = resolveBrowserGuestOpenPayload(requestedUrl, window.location.href, 'window-open');
  if (!payload) return null;

  if (targetValue === '_self') {
    window.location.assign(payload.url);
    return window;
  }

  ipcRenderer.sendToHost('browser-open-request', payload);
  return null;
}) as typeof window.open;
