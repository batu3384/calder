import { escapeCssAttributeValue, escapeCssIdentifier } from './browser-tab-selector-utils';

export type SelectorOptionType = 'qa' | 'attr' | 'id' | 'class' | 'aria' | 'role' | 'name' | 'css';

export interface SelectorOption {
  type: SelectorOptionType;
  label: string;
  value: string;
}

export type SelectorVerificationStatus = 'unique' | 'ambiguous' | 'missing';

export interface SelectorVerification {
  status: SelectorVerificationStatus;
  matchCount: number;
}

const QA_ATTRS = ['data-testid', 'data-qa', 'data-cy', 'data-test', 'data-automation', 'qaTag'];

const HASHED_CLASS_PATTERNS = [
  /^_[a-z0-9]{5,}$/i,
  /^[a-f0-9]{8,}$/i,
  /__[a-z0-9]{5,}$/i,
  /^css-[a-z0-9]{6,}$/i,
  /^sc-[a-zA-Z]{2,}$/,
];

export function isStableClassName(className: string): boolean {
  const trimmed = className.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return false;
  if (/^[0-9]/.test(trimmed)) return false;
  return !HASHED_CLASS_PATTERNS.some((pattern) => pattern.test(trimmed));
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
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
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

function buildClassSelector(el: Element): string | null {
  const stableClasses = Array.from(el.classList).filter(isStableClassName).slice(0, 3);
  if (stableClasses.length === 0) return null;
  const tag = el.tagName.toLowerCase();
  return `${tag}.${stableClasses.map((name) => escapeCssIdentifier(name)).join('.')}`;
}

export function buildAllSelectors(el: Element): SelectorOption[] {
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

  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    options.push({
      type: 'aria',
      label: 'aria-label',
      value: `[aria-label="${escapeCssAttributeValue(ariaLabel)}"]`,
    });
  }

  const role = el.getAttribute('role')?.trim();
  if (role) {
    const tag = el.tagName.toLowerCase();
    options.push({
      type: 'role',
      label: 'role',
      value: `${tag}[role="${escapeCssAttributeValue(role)}"]`,
    });
  }

  const nameAttr = el.getAttribute('name')?.trim();
  if (nameAttr) {
    options.push({
      type: 'name',
      label: 'name',
      value: `[name="${escapeCssAttributeValue(nameAttr)}"]`,
    });
  }

  if (el.id) {
    options.push({ type: 'id', label: 'id', value: `#${escapeCssIdentifier(el.id)}` });
  }

  const classSelector = buildClassSelector(el);
  if (classSelector) {
    options.push({ type: 'class', label: 'class', value: classSelector });
  }

  options.push({ type: 'css', label: 'css', value: buildCssPath(el) });
  return options;
}

export function selectorValuesFromOptions(options: SelectorOption[]): string[] {
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

export function buildShadowHostSelectorChain(el: Element): string[][] {
  const chain: string[][] = [];
  let root: Node = el.getRootNode();
  while (root instanceof ShadowRoot) {
    const hostSelectors = selectorValuesFromOptions(buildAllSelectors(root.host));
    if (hostSelectors.length > 0) chain.unshift(hostSelectors);
    root = root.host.getRootNode();
  }
  return chain;
}

export function buildVisibleElementText(el: Element, maxLength = 150): string {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel)
    return ariaLabel.length > maxLength ? `${ariaLabel.slice(0, maxLength - 1)}…` : ariaLabel;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const value = (el.value || el.placeholder || '').trim();
    if (value) {
      return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
    }
  }

  const innerText = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim();
  if (innerText) {
    return innerText.length > maxLength ? `${innerText.slice(0, maxLength - 1)}…` : innerText;
  }

  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function safeQuerySelectorAll(root: Document | ShadowRoot, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function safeQuerySelector(root: Document | ShadowRoot, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

export function collectSameOriginDocuments(rootDocument: Document): Document[] {
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

export function findElementInRoot(
  root: Document | ShadowRoot,
  selectors: string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const found = safeQuerySelector(root, selector);
    if (found instanceof HTMLElement) return found;
  }
  return null;
}

export function findElementInOpenShadowTree(
  root: Document | ShadowRoot,
  selectors: string[],
): HTMLElement | null {
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

export function resolveShadowHostChainRoot(
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

function collectMatchesInOpenShadowTree(root: Document | ShadowRoot, selector: string): Element[] {
  const matches = safeQuerySelectorAll(root, selector);
  const nested: Element[] = [];
  for (const node of root.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || !node.shadowRoot) continue;
    nested.push(...collectMatchesInOpenShadowTree(node.shadowRoot, selector));
  }
  return [...matches, ...nested];
}

export function findSelectorMatches(selector: string, shadowHostSelectors: string[][]): Element[] {
  const docs = collectSameOriginDocuments(document);
  const matches: Element[] = [];
  const seen = new Set<Element>();

  for (const doc of docs) {
    if (shadowHostSelectors.length > 0) {
      const shadowRoot = resolveShadowHostChainRoot(doc, shadowHostSelectors);
      if (shadowRoot) {
        for (const match of collectMatchesInOpenShadowTree(shadowRoot, selector)) {
          if (!seen.has(match)) {
            seen.add(match);
            matches.push(match);
          }
        }
      }
      continue;
    }

    for (const match of collectMatchesInOpenShadowTree(doc, selector)) {
      if (!seen.has(match)) {
        seen.add(match);
        matches.push(match);
      }
    }
  }

  return matches;
}

export function verifySelectorResolution(
  selector: string,
  shadowHostSelectors: string[][],
  targetElement: Element,
): SelectorVerification {
  const trimmed = selector.trim();
  if (!trimmed) return { status: 'missing', matchCount: 0 };

  const matches = findSelectorMatches(trimmed, shadowHostSelectors);
  const matchCount = matches.length;
  const matchesTarget = matches.includes(targetElement);

  if (matchCount === 0 || !matchesTarget) {
    return { status: 'missing', matchCount };
  }
  if (matchCount === 1) {
    return { status: 'unique', matchCount };
  }
  return { status: 'ambiguous', matchCount };
}

export function pickPreferredSelector(
  selectors: SelectorOption[],
  shadowHostSelectors: string[][],
  targetElement: Element,
): SelectorOption {
  for (const option of selectors) {
    const verification = verifySelectorResolution(option.value, shadowHostSelectors, targetElement);
    if (verification.status === 'unique') return option;
  }
  return selectors[0] ?? { type: 'css', label: 'css', value: targetElement.tagName.toLowerCase() };
}
