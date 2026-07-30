const INTERACTIVE_CAPTURE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const GRAPHIC_TAGS = new Set(['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon']);

export function liftCaptureTarget(el: Element): Element {
  const interactive = el.closest(INTERACTIVE_CAPTURE_SELECTOR);
  if (interactive instanceof Element) return interactive;

  const tag = el.tagName.toLowerCase();
  if (GRAPHIC_TAGS.has(tag)) {
    const lifted = el.closest('button,a,[role="button"],[role="link"]');
    if (lifted instanceof Element) return lifted;
  }

  return el;
}
