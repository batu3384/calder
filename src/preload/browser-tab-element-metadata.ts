import { liftCaptureTarget } from './browser-tab-capture-target';
import {
  buildAllSelectors,
  buildShadowHostSelectorChain,
  buildVisibleElementText,
  type SelectorOption,
  selectorValuesFromOptions,
  type SelectorVerification,
  verifySelectorResolution,
} from './browser-tab-selector-engine';

export type { SelectorOption, SelectorVerification } from './browser-tab-selector-engine';

interface RelativeClickPoint {
  normalizedX: number;
  normalizedY: number;
}

export interface ElementMetadata {
  tagName: string;
  id: string;
  classes: string[];
  textContent: string;
  selectors: SelectorOption[];
  selectorValues: string[];
  selectorVerifications: Record<string, SelectorVerification>;
  shadowHostSelectors: string[][];
  pageUrl: string;
  clickPoint?: RelativeClickPoint;
  isCanvasLike?: boolean;
  captureTargetId: string;
  liftedFromTag?: string;
}

const captureTargetRegistry = new Map<string, Element>();
let captureTargetSeq = 0;

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildRelativeClickPoint(
  el: Element,
  clientX: number,
  clientY: number,
): RelativeClickPoint | undefined {
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

function registerCaptureTarget(el: Element): string {
  for (const [id, target] of captureTargetRegistry) {
    if (!target.isConnected) captureTargetRegistry.delete(id);
  }

  const id = `cap-${++captureTargetSeq}`;
  captureTargetRegistry.set(id, el);
  // ponytail: FIFO cap 64; upgrade to LRU keyed by open inspect panel if power users hit this.
  while (captureTargetRegistry.size > 64) {
    const oldest = captureTargetRegistry.keys().next().value;
    if (!oldest) break;
    captureTargetRegistry.delete(oldest);
  }
  return id;
}

export function resolveCaptureTarget(captureTargetId: string): Element | undefined {
  const target = captureTargetRegistry.get(captureTargetId);
  if (!target || !target.isConnected) {
    captureTargetRegistry.delete(captureTargetId);
    return undefined;
  }
  return target;
}

export function verifyCaptureSelector(payload: {
  captureTargetId: string;
  selector: string;
  shadowHostSelectors?: string[][];
}): SelectorVerification {
  const target = resolveCaptureTarget(payload.captureTargetId);
  if (!target) return { status: 'missing', matchCount: 0 };
  return verifySelectorResolution(payload.selector, payload.shadowHostSelectors ?? [], target);
}

function isCanvasLikeElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'canvas') return true;
  if (tag === 'svg' && el.closest('[role="img"],[role="graphics-document"]')) return true;
  return false;
}

export function getElementMetadata(
  rawTarget: Element,
  clickPosition?: { clientX: number; clientY: number },
): ElementMetadata {
  const liftedFromTag =
    rawTarget.tagName.toLowerCase() !== liftCaptureTarget(rawTarget).tagName.toLowerCase()
      ? rawTarget.tagName.toLowerCase()
      : undefined;
  const el = liftCaptureTarget(rawTarget);
  const selectors = buildAllSelectors(el);
  const shadowHostSelectors = buildShadowHostSelectorChain(el);
  const selectorVerifications: Record<string, SelectorVerification> = {};
  for (const option of selectors) {
    selectorVerifications[option.value] = verifySelectorResolution(
      option.value,
      shadowHostSelectors,
      el,
    );
  }
  const pageUrl = el.ownerDocument.defaultView?.location.href || window.location.href;
  const clickPoint = clickPosition
    ? buildRelativeClickPoint(el, clickPosition.clientX, clickPosition.clientY)
    : undefined;

  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    classes: Array.from(el.classList),
    textContent: buildVisibleElementText(el),
    selectors,
    selectorValues: selectorValuesFromOptions(selectors),
    selectorVerifications,
    shadowHostSelectors,
    pageUrl,
    clickPoint,
    isCanvasLike: isCanvasLikeElement(el),
    captureTargetId: registerCaptureTarget(el),
    liftedFromTag,
  };
}
