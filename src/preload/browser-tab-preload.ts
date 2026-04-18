/**
 * Preload script injected into browser-tab <webview> guests.
 * Provides DOM element inspection: hover highlight, click to select,
 * and sends element metadata back to the host renderer via ipcRenderer.sendToHost().
 */
import { ipcRenderer } from 'electron';
import { escapeCssAttributeValue, escapeCssIdentifier } from './browser-tab-selector-utils';
import { replayFlowClick } from './browser-tab-flow-replay';

interface SelectorOption {
  type: 'qa' | 'attr' | 'id' | 'css';
  label: string;
  value: string;
}

type BrowserGuestOpenSource = 'anchor' | 'window-open';

interface BrowserGuestOpenPayload {
  url: string;
  source: BrowserGuestOpenSource;
}

interface RelativeClickPoint {
  normalizedX: number;
  normalizedY: number;
}

interface ElementMetadata {
  tagName: string;
  id: string;
  classes: string[];
  textContent: string;
  selectors: SelectorOption[];
  selectorValues: string[];
  shadowHostSelectors: string[][];
  pageUrl: string;
  clickPoint?: RelativeClickPoint;
  isCanvasLike?: boolean;
}

interface AuthFillPayload {
  username?: unknown;
  password?: unknown;
}

const QA_ATTRS = ['data-testid', 'data-qa', 'data-cy', 'data-test', 'data-automation', 'qaTag'];

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
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
let drawMode = false;
let suppressNextFlowClick = false;
const highlightOverlays = new Map<Document, HTMLDivElement>();

let drawCanvas: HTMLCanvasElement | null = null;
let drawCtx: CanvasRenderingContext2D | null = null;
let drawing = false;
let strokeCompleted = false;

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

function applyDrawStyles(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ff3b30';
}

function ensureDrawCanvas(): HTMLCanvasElement {
  if (!drawCanvas) {
    drawCanvas = document.createElement('canvas');
    // edit_pen icon with thick white outline for visibility on any background
    const penSvg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 -960 960 960'>" +
      "<path fill='black' stroke='white' stroke-width='90' stroke-linejoin='round' paint-order='stroke' " +
      "d='M180.18-144q-15.18 0-25.68-10.3-10.5-10.29-10.5-25.52v-86.85q0-14.33 5-27.33 5-13 16-24l477-477q11-11 23.84-16 12.83-5 27-5 14.16 0 27.16 5t24 16l51 51q11 11 16 24t5 26.54q0 14.45-5.02 27.54T795-642L318-165q-11 11-23.95 16t-27.24 5h-86.63ZM693-642l51-51-51-51-51 51 51 51Z'/>" +
      "</svg>";
    drawCanvas.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'z-index:2147483646;pointer-events:auto;' +
      `cursor:url("data:image/svg+xml;utf8,${penSvg}") 5 24, crosshair;` +
      'background:transparent;';
    drawCanvas.width = window.innerWidth;
    drawCanvas.height = window.innerHeight;
    document.documentElement.appendChild(drawCanvas);
    drawCtx = drawCanvas.getContext('2d');
    if (drawCtx) applyDrawStyles(drawCtx);
  }
  return drawCanvas;
}

function onDrawPointerDown(e: PointerEvent): void {
  if (!drawMode || !drawCtx) return;
  e.preventDefault();
  e.stopPropagation();
  if (drawCanvas && drawCanvas.hasPointerCapture && drawCanvas.setPointerCapture) {
    try {
      if (!drawCanvas.hasPointerCapture(e.pointerId)) drawCanvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can fail on synthetic/untrusted events.
    }
  }
  if (strokeCompleted && drawCanvas) {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    strokeCompleted = false;
  }
  drawing = true;
  drawCtx.beginPath();
  drawCtx.moveTo(e.clientX, e.clientY);
}

function onDrawPointerMove(e: PointerEvent): void {
  if (!drawMode || !drawing || !drawCtx) return;
  e.preventDefault();
  drawCtx.lineTo(e.clientX, e.clientY);
  drawCtx.stroke();
}

function onDrawPointerUp(e: PointerEvent): void {
  if (!drawMode || !drawing) return;
  e.preventDefault();
  if (drawCanvas && drawCanvas.hasPointerCapture && drawCanvas.releasePointerCapture) {
    try {
      if (drawCanvas.hasPointerCapture(e.pointerId)) drawCanvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release failures; stroke completion still proceeds.
    }
  }
  drawing = false;
  strokeCompleted = true;
  ipcRenderer.sendToHost('draw-stroke-end', { x: e.clientX, y: e.clientY });
}

function onDrawResize(): void {
  if (!drawCanvas || !drawCtx) return;
  // Resizing a canvas clears its bitmap, so snapshot first and blit back.
  const tmp = document.createElement('canvas');
  tmp.width = drawCanvas.width;
  tmp.height = drawCanvas.height;
  tmp.getContext('2d')?.drawImage(drawCanvas, 0, 0);
  drawCanvas.width = window.innerWidth;
  drawCanvas.height = window.innerHeight;
  applyDrawStyles(drawCtx);
  drawCtx.drawImage(tmp, 0, 0);
}

function enterDrawMode(): void {
  drawMode = true;
  strokeCompleted = false;
  const canvas = ensureDrawCanvas();
  canvas.style.display = 'block';
  canvas.addEventListener('pointerdown', onDrawPointerDown, true);
  canvas.addEventListener('pointermove', onDrawPointerMove, true);
  canvas.addEventListener('pointerup', onDrawPointerUp, true);
  canvas.addEventListener('pointercancel', onDrawPointerUp, true);
  window.addEventListener('resize', onDrawResize);
}

function exitDrawMode(): void {
  drawMode = false;
  drawing = false;
  strokeCompleted = false;
  if (drawCanvas) {
    drawCanvas.removeEventListener('pointerdown', onDrawPointerDown, true);
    drawCanvas.removeEventListener('pointermove', onDrawPointerMove, true);
    drawCanvas.removeEventListener('pointerup', onDrawPointerUp, true);
    drawCanvas.removeEventListener('pointercancel', onDrawPointerUp, true);
    if (drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawCanvas.remove();
    drawCanvas = null;
    drawCtx = null;
  }
  window.removeEventListener('resize', onDrawResize);
}

function clearDrawing(): void {
  if (drawCtx && drawCanvas) {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }
  strokeCompleted = false;
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

function buildCssPath(el: Element): string {
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${escapeCssIdentifier(current.id)}`;
      parts.unshift(selector);
      break; // ID is unique enough
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  if (parts.length === 0) return el.tagName.toLowerCase();
  return parts.join(' > ');
}

function buildAllSelectors(el: Element): SelectorOption[] {
  const options: SelectorOption[] = [];

  const qaSet = new Set(QA_ATTRS);
  for (const attr of QA_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      options.push({
        type: 'qa',
        label: attr,
        value: `[${escapeCssIdentifier(attr)}="${escapeCssAttributeValue(val)}"]`,
      });
    }
  }

  for (const attr of el.getAttributeNames()) {
    if (attr.startsWith('data-') && !qaSet.has(attr)) {
      const val = el.getAttribute(attr);
      if (val) {
        options.push({
          type: 'attr',
          label: attr,
          value: `[${escapeCssIdentifier(attr)}="${escapeCssAttributeValue(val)}"]`,
        });
      }
    }
  }

  if (el.id) options.push({ type: 'id', label: 'id', value: `#${escapeCssIdentifier(el.id)}` });

  options.push({ type: 'css', label: 'css', value: buildCssPath(el) });

  return options;
}

function selectorValuesFromOptions(options: SelectorOption[]): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const value = option.value.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function buildShadowHostSelectorChain(el: Element): string[][] {
  const chain: string[][] = [];
  let root: Node = el.getRootNode();
  while (root instanceof ShadowRoot) {
    const hostSelectors = selectorValuesFromOptions(buildAllSelectors(root.host));
    if (hostSelectors.length > 0) chain.unshift(hostSelectors);
    root = root.host.getRootNode();
  }
  return chain;
}

function buildRelativeClickPoint(el: Element, clientX: number, clientY: number): RelativeClickPoint | undefined {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  const normalizedX = (clientX - rect.left) / rect.width;
  const normalizedY = (clientY - rect.top) / rect.height;
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) return undefined;
  return {
    normalizedX: clampNumber(normalizedX, 0, 1),
    normalizedY: clampNumber(normalizedY, 0, 1),
  };
}

function getElementMetadata(
  el: Element,
  clickPosition?: { clientX: number; clientY: number },
): ElementMetadata {
  const text = (el.textContent || '').trim();
  const selectors = buildAllSelectors(el);
  const pageUrl = el.ownerDocument.defaultView?.location.href || window.location.href;
  const clickPoint = clickPosition
    ? buildRelativeClickPoint(el, clickPosition.clientX, clickPosition.clientY)
    : undefined;
  const isCanvasLike = el.tagName.toLowerCase() === 'canvas';
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    classes: Array.from(el.classList),
    textContent: text.length > 150 ? text.slice(0, 150) + '\u2026' : text,
    selectors,
    selectorValues: selectorValuesFromOptions(selectors),
    shadowHostSelectors: buildShadowHostSelectorChain(el),
    pageUrl,
    clickPoint,
    isCanvasLike,
  };
}

function setInputElementValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function isLikelyUsernameInput(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly) return false;
  if (input.type === 'hidden' || input.type === 'password') return false;
  const type = (input.type || '').toLowerCase();
  if (type && !['text', 'email', 'search', 'tel', 'url', 'number'].includes(type)) return false;

  const name = `${input.name || ''} ${input.id || ''} ${input.getAttribute('autocomplete') || ''}`.toLowerCase();
  if (name.includes('user') || name.includes('login') || name.includes('email')) return true;
  return true;
}

function findPrimaryPasswordInput(doc: Document): HTMLInputElement | null {
  return doc.querySelector<HTMLInputElement>('input[type="password"]:not([disabled]):not([readonly])');
}

function isPrecedingNode(candidate: Node, reference: Node): boolean {
  const relation = candidate.compareDocumentPosition(reference);
  return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
}

function findUsernameNearPassword(passwordInput: HTMLInputElement): HTMLInputElement | null {
  const scope = passwordInput.form ?? passwordInput.ownerDocument;
  const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>('input'))
    .filter(isLikelyUsernameInput);
  const beforePassword = candidates.find((candidate) => isPrecedingNode(candidate, passwordInput));
  if (beforePassword) return beforePassword;
  return candidates[0] ?? null;
}

function fillCredentialsInDocument(doc: Document, username: string, password: string): {
  filledUsername: boolean;
  filledPassword: boolean;
} {
  const passwordInput = findPrimaryPasswordInput(doc);
  const usernameInput = passwordInput
    ? findUsernameNearPassword(passwordInput)
    : doc.querySelector<HTMLInputElement>('input[autocomplete="username"], input[type="email"], input[type="text"]');

  let filledUsername = false;
  let filledPassword = false;

  if (usernameInput && username) {
    setInputElementValue(usernameInput, username);
    filledUsername = true;
  }

  if (passwordInput && password) {
    setInputElementValue(passwordInput, password);
    filledPassword = true;
  }

  return { filledUsername, filledPassword };
}

function fillCredentialsAcrossFrames(payload: AuthFillPayload): { filledUsername: boolean; filledPassword: boolean } {
  const username = typeof payload.username === 'string' ? payload.username : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!username && !password) {
    return { filledUsername: false, filledPassword: false };
  }

  const docs = collectSameOriginFrameDocuments(document);
  let filledUsername = false;
  let filledPassword = false;
  for (const doc of docs) {
    const result = fillCredentialsInDocument(doc, username, password);
    filledUsername = filledUsername || result.filledUsername;
    filledPassword = filledPassword || result.filledPassword;
  }
  return { filledUsername, filledPassword };
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

function onClick(e: MouseEvent): void {
  if (!inspectMode) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const target = resolveEventElementTarget(e);
  if (!target) return;
  const metadata = getElementMetadata(target, { clientX: e.clientX, clientY: e.clientY });
  ipcRenderer.sendToHost('element-selected', { metadata, x: e.clientX, y: e.clientY });
}

function onPopupAnchorClick(e: MouseEvent): void {
  if (inspectMode || flowMode || drawMode || e.defaultPrevented) return;
  const target = resolveEventElementTarget(e);
  const anchor = findPopupAnchor(target);
  if (!anchor) return;
  if (!shouldRouteBrowserOpenIntent({
    targetAttr: anchor.getAttribute('target'),
    button: e.button,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
  })) {
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

function enterFlowMode(): void {
  flowMode = true;
  syncFlowListeners();
}

function exitFlowMode(): void {
  flowMode = false;
  removeFlowListeners();
  hideOverlay();
}

function enterInspectMode(): void {
  inspectMode = true;
  syncInspectListeners();
  document.documentElement.dataset.calderInspectMode = 'on';
}

function exitInspectMode(): void {
  inspectMode = false;
  removeInspectListeners();
  hideOverlay();
  document.documentElement.dataset.calderInspectMode = 'off';
}

ipcRenderer.on('enter-inspect-mode', () => enterInspectMode());
ipcRenderer.on('exit-inspect-mode', () => exitInspectMode());
ipcRenderer.on('enter-flow-mode', () => enterFlowMode());
ipcRenderer.on('exit-flow-mode', () => exitFlowMode());
ipcRenderer.on('enter-draw-mode', () => enterDrawMode());
ipcRenderer.on('exit-draw-mode', () => exitDrawMode());
ipcRenderer.on('draw-clear', () => clearDrawing());
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

document.addEventListener('click', onPopupAnchorClick, true);
document.addEventListener('auxclick', onPopupAnchorClick, true);

window.open = ((url?: string | URL, target?: string) => {
  const requestedUrl = typeof url === 'string' ? url : url?.toString() ?? '';
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
