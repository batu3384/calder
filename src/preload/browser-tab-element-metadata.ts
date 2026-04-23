import { escapeCssAttributeValue, escapeCssIdentifier } from './browser-tab-selector-utils';

interface SelectorOption {
  type: 'qa' | 'attr' | 'id' | 'css';
  label: string;
  value: string;
}

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
  shadowHostSelectors: string[][];
  pageUrl: string;
  clickPoint?: RelativeClickPoint;
  isCanvasLike?: boolean;
}

const QA_ATTRS = ['data-testid', 'data-qa', 'data-cy', 'data-test', 'data-automation', 'qaTag'];

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
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

export function getElementMetadata(
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
