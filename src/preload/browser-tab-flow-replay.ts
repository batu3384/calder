export interface ReplayClickPoint {
  normalizedX: number;
  normalizedY: number;
}

export interface NormalizedFlowReplayPayload {
  selectors: string[];
  shadowHostSelectors: string[][];
  clickPoint?: ReplayClickPoint;
  isCanvasLike: boolean;
  tagName?: string;
  timeoutMs: number;
  retryIntervalMs: number;
}

interface LoggerLike {
  warn: (...args: unknown[]) => void;
}

const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_RETRY_MS = 120;
const MIN_TIMEOUT_MS = 200;
const MAX_TIMEOUT_MS = 4000;
const MIN_RETRY_MS = 50;
const MAX_RETRY_MS = 500;

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseBoundedNumber(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return clampNumber(parsed, min, max);
}

function normalizeSelectorList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function safeQuerySelector(root: Document | ShadowRoot, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function findElementInRoot(root: Document | ShadowRoot, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const found = safeQuerySelector(root, selector);
    if (found instanceof HTMLElement) return found;
  }
  return null;
}

function findElementInOpenShadowTree(root: Document | ShadowRoot, selectors: string[]): HTMLElement | null {
  const direct = findElementInRoot(root, selectors);
  if (direct) return direct;

  for (const node of root.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement)) continue;
    const shadowRoot = node.shadowRoot;
    if (!shadowRoot) continue;
    const nested = findElementInOpenShadowTree(shadowRoot, selectors);
    if (nested) return nested;
  }

  return null;
}

function resolveShadowHostChainRoot(
  startRoot: Document | ShadowRoot,
  hostSelectorChain: string[][],
): Document | ShadowRoot | null {
  if (hostSelectorChain.length === 0) return startRoot;

  let currentRoot: Document | ShadowRoot = startRoot;
  for (const hostSelectors of hostSelectorChain) {
    const host = findElementInOpenShadowTree(currentRoot, hostSelectors);
    if (!host?.shadowRoot) return null;
    currentRoot = host.shadowRoot;
  }
  return currentRoot;
}

function collectSameOriginDocuments(rootDocument: Document): Document[] {
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

function findCanvasFallback(
  root: Document | ShadowRoot,
  payload: NormalizedFlowReplayPayload,
): HTMLElement | null {
  const selectors = payload.selectors.filter((selector) =>
    selector.toLowerCase().includes('canvas')
  );
  const fromSelectors = selectors.length > 0 ? findElementInOpenShadowTree(root, selectors) : null;
  if (fromSelectors) return fromSelectors;

  const byTag = payload.tagName ? findElementInOpenShadowTree(root, [payload.tagName]) : null;
  if (byTag && byTag.tagName.toLowerCase() === 'canvas') return byTag;

  return findElementInOpenShadowTree(root, ['canvas']);
}

function resolveReplayTarget(payload: NormalizedFlowReplayPayload): HTMLElement | null {
  const docs = collectSameOriginDocuments(document);

  for (const doc of docs) {
    if (payload.shadowHostSelectors.length > 0) {
      const shadowRoot = resolveShadowHostChainRoot(doc, payload.shadowHostSelectors);
      if (shadowRoot) {
        const shadowTarget = findElementInOpenShadowTree(shadowRoot, payload.selectors);
        if (shadowTarget) return shadowTarget;
      }
    }

    const directTarget = findElementInOpenShadowTree(doc, payload.selectors);
    if (directTarget) return directTarget;

    if (payload.isCanvasLike) {
      const canvasTarget = findCanvasFallback(doc, payload);
      if (canvasTarget) return canvasTarget;
    }
  }

  return null;
}

function dispatchMouseEvent(
  element: HTMLElement,
  type: 'mousemove' | 'mousedown' | 'mouseup' | 'click',
  clientX: number,
  clientY: number,
): void {
  const view = element.ownerDocument.defaultView;
  if (!view) return;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    button: 0,
    buttons: type === 'mousedown' ? 1 : 0,
    view,
  });
  element.dispatchEvent(event);
}

function clickElement(element: HTMLElement, clickPoint?: ReplayClickPoint): void {
  if (!clickPoint) {
    element.click();
    return;
  }

  const rect = element.getBoundingClientRect();
  const normalizedX = clampNumber(clickPoint.normalizedX, 0, 1);
  const normalizedY = clampNumber(clickPoint.normalizedY, 0, 1);
  const clientX = rect.left + normalizedX * Math.max(rect.width, 1);
  const clientY = rect.top + normalizedY * Math.max(rect.height, 1);

  dispatchMouseEvent(element, 'mousemove', clientX, clientY);
  dispatchMouseEvent(element, 'mousedown', clientX, clientY);
  dispatchMouseEvent(element, 'mouseup', clientX, clientY);
  dispatchMouseEvent(element, 'click', clientX, clientY);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseClickPoint(input: unknown): ReplayClickPoint | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const normalizedX = Number(record.normalizedX);
  const normalizedY = Number(record.normalizedY);
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) return undefined;
  return {
    normalizedX: clampNumber(normalizedX, 0, 1),
    normalizedY: clampNumber(normalizedY, 0, 1),
  };
}

export function normalizeFlowReplayPayload(raw: unknown): NormalizedFlowReplayPayload {
  if (typeof raw === 'string') {
    return {
      selectors: normalizeSelectorList([raw]),
      shadowHostSelectors: [],
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retryIntervalMs: DEFAULT_RETRY_MS,
      isCanvasLike: false,
    };
  }

  if (!raw || typeof raw !== 'object') {
    return {
      selectors: [],
      shadowHostSelectors: [],
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retryIntervalMs: DEFAULT_RETRY_MS,
      isCanvasLike: false,
    };
  }

  const record = raw as Record<string, unknown>;
  const selectors = normalizeSelectorList(record.selectors);
  const singleSelector = typeof record.selector === 'string' ? record.selector.trim() : '';
  const mergedSelectors = selectors.length > 0
    ? selectors
    : normalizeSelectorList(singleSelector ? [singleSelector] : []);

  const shadowHostSelectors = Array.isArray(record.shadowHostSelectors)
    ? record.shadowHostSelectors
      .map((entry) => normalizeSelectorList(entry))
      .filter((entry) => entry.length > 0)
    : [];

  const tagName = typeof record.tagName === 'string' ? record.tagName.trim().toLowerCase() : undefined;
  const isCanvasLike = record.isCanvasLike === true || tagName === 'canvas';

  return {
    selectors: mergedSelectors,
    shadowHostSelectors,
    clickPoint: parseClickPoint(record.clickPoint),
    isCanvasLike,
    tagName,
    timeoutMs: parseBoundedNumber(record.timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    retryIntervalMs: parseBoundedNumber(record.retryIntervalMs, DEFAULT_RETRY_MS, MIN_RETRY_MS, MAX_RETRY_MS),
  };
}

export async function replayFlowClick(
  rawPayload: unknown,
  options: { suppressRecording: () => void; logger?: LoggerLike },
): Promise<boolean> {
  const payload = normalizeFlowReplayPayload(rawPayload);
  const logger = options.logger ?? console;

  if (payload.selectors.length === 0 && !payload.isCanvasLike) {
    logger.warn('Flow replay skipped: empty selector payload');
    return false;
  }

  const deadline = Date.now() + payload.timeoutMs;
  while (Date.now() <= deadline) {
    const target = resolveReplayTarget(payload);
    if (target) {
      options.suppressRecording();
      clickElement(target, payload.clickPoint);
      return true;
    }

    if (Date.now() + payload.retryIntervalMs > deadline) break;
    await wait(payload.retryIntervalMs);
  }

  logger.warn('Flow replay target not found before timeout', payload);
  return false;
}
