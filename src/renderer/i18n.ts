import type { UiLanguage } from '../shared/types/provider.js';
import { createPatternTranslations } from './i18n-pattern-translations.js';
import { DIRECT_TRANSLATIONS } from './i18n-translations.js';
import { appState } from './state.js';

const DEFAULT_LANGUAGE: UiLanguage = 'en';
const LOCALIZE_ROOT_SELECTOR = '#app';

const EXCLUDED_SELECTOR = [
  'pre',
  'code',
  'textarea',
  'webview',
  '.xterm',
  '.xterm-viewport',
  '.xterm-screen',
  '.xterm-rows',
  '.xterm-helper-textarea',
  '.ansi-buffer',
].join(', ');

const ATTRIBUTES_TO_LOCALIZE = ['title', 'aria-label', 'placeholder'] as const;

let activeLanguage: UiLanguage = DEFAULT_LANGUAGE;
let observer: MutationObserver | null = null;
let suppressObserver = false;
let pendingReloadTimer: number | null = null;
let pendingLocalizeRaf: number | null = null;
let patternTranslations = createPatternTranslations(translate);

function normalizeTranslationKey(value: string): string {
  return value
    .replace(/\u00a0/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[’‘]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/…/gu, '...')
    .trim();
}

const NORMALIZED_DIRECT_TRANSLATIONS = new Map<string, string>(
  [...DIRECT_TRANSLATIONS.entries()].map(([source, target]) => [
    normalizeTranslationKey(source),
    target,
  ]),
);

function normalizeLanguage(input: unknown): UiLanguage {
  return input === 'tr' ? 'tr' : 'en';
}

function withSuppressedObserver(work: () => void): void {
  suppressObserver = true;
  try {
    work();
  } finally {
    suppressObserver = false;
  }
}

function localizeRoot(): ParentNode | null {
  return document.querySelector(LOCALIZE_ROOT_SELECTOR) ?? document.body;
}

function shouldSkipTextElement(element: Element | null): boolean {
  if (!element) return true;
  if (element.closest(EXCLUDED_SELECTOR)) return true;
  const tag = element.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE';
}

function shouldSkipAttributeElement(element: Element | null): boolean {
  if (!element) return true;
  const tag = element.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE';
}

function translateScalar(value: string): string {
  const normalized = normalizeTranslationKey(value);
  const direct = DIRECT_TRANSLATIONS.get(value) ?? NORMALIZED_DIRECT_TRANSLATIONS.get(normalized);
  if (direct) return direct;

  for (const entry of patternTranslations) {
    const match = value.match(entry.pattern);
    if (match) return entry.replace(match);

    const normalizedMatch = normalized.match(entry.pattern);
    if (normalizedMatch) return entry.replace(normalizedMatch);
  }
  return value;
}

function translate(value: string): string {
  if (activeLanguage !== 'tr') return value;
  const direct = translateScalar(value);
  if (direct !== value) return direct;
  if (!value.includes('\n')) return value;

  const lines = value.split('\n');
  const translatedLines = lines.map((line) => (line.trim() ? translateScalar(line) : line));
  return translatedLines.some((line, index) => line !== lines[index])
    ? translatedLines.join('\n')
    : value;
}

function localizeTextNode(node: Text): void {
  const raw = node.nodeValue;
  if (!raw) return;
  if (!raw.trim()) return;
  const parent = node.parentElement;
  if (shouldSkipTextElement(parent)) return;

  const core = raw.trim();
  const translated = translate(core);
  if (translated === core) return;
  node.nodeValue = raw.replace(core, translated);
}

function localizeAttributes(element: Element): void {
  if (shouldSkipAttributeElement(element)) return;
  for (const attribute of ATTRIBUTES_TO_LOCALIZE) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translate(value);
    if (translated !== value) {
      element.setAttribute(attribute, translated);
    }
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === 'button' || element.type === 'submit' || element.type === 'reset') {
      const translated = translate(element.value);
      if (translated !== element.value) {
        element.value = translated;
      }
    }
  }
}

function localizeExcludedDescendantAttributes(root: Element): void {
  if (
    !root.matches('.xterm, .xterm-viewport, .xterm-screen, .xterm-rows, .xterm-helper-textarea')
  ) {
    return;
  }
  for (const descendant of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
    localizeAttributes(descendant);
  }
}

function localizeNode(node: Node): void {
  if (activeLanguage !== 'tr') return;
  if (node.nodeType === Node.TEXT_NODE) {
    localizeTextNode(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  if (shouldSkipAttributeElement(element)) return;
  localizeAttributes(element);
  if (shouldSkipTextElement(element)) {
    localizeExcludedDescendantAttributes(element);
    return;
  }
  for (const child of element.childNodes) {
    localizeNode(child);
  }
}

function localizeDocument(): void {
  withSuppressedObserver(() => {
    const root = localizeRoot();
    if (!root) return;
    for (const child of root.childNodes) {
      localizeNode(child);
    }
  });
}

function scheduleLocalizeSubtree(nodes: Iterable<Node>): void {
  if (activeLanguage !== 'tr' || suppressObserver) return;
  if (pendingLocalizeRaf !== null) return;
  pendingLocalizeRaf = requestAnimationFrame(() => {
    pendingLocalizeRaf = null;
    if (activeLanguage !== 'tr' || suppressObserver) return;
    withSuppressedObserver(() => {
      for (const node of nodes) {
        localizeNode(node);
      }
    });
  });
}

function stopObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (pendingLocalizeRaf !== null) {
    cancelAnimationFrame(pendingLocalizeRaf);
    pendingLocalizeRaf = null;
  }
}

function startObserver(): void {
  const root = localizeRoot();
  if (!root || observer) return;
  observer = new MutationObserver((mutations) => {
    if (activeLanguage !== 'tr' || suppressObserver) return;
    const pendingNodes: Node[] = [];
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          pendingNodes.push(node);
        }
      } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        pendingNodes.push(mutation.target);
      }
    }
    if (pendingNodes.length > 0) {
      scheduleLocalizeSubtree(pendingNodes);
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES_TO_LOCALIZE, 'value'],
  });
}

function applyLanguage(language: UiLanguage): void {
  activeLanguage = language;
  document.documentElement.lang = language;
  if (language === 'tr') {
    localizeDocument();
    startObserver();
    queueMicrotask(localizeDocument);
    return;
  }
  stopObserver();
}

export function markUiReady(): void {
  document.documentElement.dataset.uiReady = '1';
}

export function t(value: string): string {
  return translate(value);
}

export function localizeSubtree(root: ParentNode): void {
  if (activeLanguage !== 'tr') return;
  withSuppressedObserver(() => {
    for (const child of root.childNodes) {
      localizeNode(child);
    }
  });
}

export function initLocalization(): void {
  applyLanguage(normalizeLanguage(appState.preferences.language));
  appState.on('preferences-changed', () => {
    const nextLanguage = normalizeLanguage(appState.preferences.language);
    if (nextLanguage === activeLanguage) return;

    // DOM text nodes are mutated in place for Turkish; reload for a clean language switch.
    if (pendingReloadTimer !== null) {
      window.clearTimeout(pendingReloadTimer);
    }
    pendingReloadTimer = window.setTimeout(() => {
      pendingReloadTimer = null;
      window.location.reload();
    }, 120);
  });
}
