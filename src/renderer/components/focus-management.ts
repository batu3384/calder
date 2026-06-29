/**
 * Focus management utilities for improved accessibility.
 * Provides centralized focus handling and screen reader announcements.
 */

let ariaLiveRegion: HTMLElement | null = null;
let pendingAnnounceTimeouts: [ReturnType<typeof setTimeout>, ReturnType<typeof setTimeout>] | null =
  null;

export function getOrCreateAriaLiveRegion(): HTMLElement | null {
  if (ariaLiveRegion) return ariaLiveRegion;
  if (typeof document === 'undefined' || !document.body) return null;

  ariaLiveRegion = document.createElement('div');
  ariaLiveRegion.id = 'aria-live-region';
  ariaLiveRegion.setAttribute('aria-live', 'polite');
  ariaLiveRegion.setAttribute('aria-atomic', 'true');
  ariaLiveRegion.className = 'sr-only';
  if ('style' in ariaLiveRegion && ariaLiveRegion.style) {
    ariaLiveRegion.style.cssText = [
      'position: absolute',
      'width: 1px',
      'height: 1px',
      'padding: 0',
      'margin: -1px',
      'overflow: hidden',
      'clip: rect(0, 0, 0, 0)',
      'white-space: nowrap',
      'border: 0',
    ].join(';');
  }
  document.body.appendChild(ariaLiveRegion);
  return ariaLiveRegion;
}

export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite',
): void {
  const region = getOrCreateAriaLiveRegion();
  if (!region) return;
  region.setAttribute('aria-live', priority);

  // Cancel any pending announcements from previous calls.
  if (pendingAnnounceTimeouts) {
    clearTimeout(pendingAnnounceTimeouts[0]);
    clearTimeout(pendingAnnounceTimeouts[1]);
    pendingAnnounceTimeouts = null;
  }

  region.textContent = '';

  const t1 = setTimeout(() => {
    region.textContent = message;
  }, 50);

  const t2 = setTimeout(() => {
    region.textContent = '';
    if (pendingAnnounceTimeouts) {
      pendingAnnounceTimeouts = null;
    }
  }, 3000);

  pendingAnnounceTimeouts = [t1, t2];
}

export function announcePolite(message: string): void {
  announceToScreenReader(message, 'polite');
}

export function announceAssertive(message: string): void {
  announceToScreenReader(message, 'assertive');
}

export function trapFocus(container: HTMLElement): () => void {
  const focusableSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelector);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  container.addEventListener('keydown', handleKeydown);

  return () => {
    container.removeEventListener('keydown', handleKeydown);
  };
}

export function isKeyboardUser(): boolean {
  let isKeyboard = false;

  const handler = () => {
    isKeyboard = true;
    document.removeEventListener('mousedown', handler);
  };

  document.addEventListener('mousedown', handler);

  setTimeout(() => {
    document.removeEventListener('mousedown', handler);
  }, 100);

  return isKeyboard;
}

export function handleTabKey(target: HTMLElement, onTab: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      onTab();
    }
  };

  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}

export const FOCUS_STYLES = {
  outline: '2px solid var(--border-focus)',
  outlineOffset: '2px',
  boxShadow: 'var(--shadow-focus-ring)',
} as const;

export function applyFocusVisible(element: HTMLElement): void {
  element.style.outline = FOCUS_STYLES.outline;
  element.style.outlineOffset = FOCUS_STYLES.outlineOffset;
  element.style.boxShadow = FOCUS_STYLES.boxShadow;
}

export function removeFocusVisible(element: HTMLElement): void {
  element.style.outline = '';
  element.style.outlineOffset = '';
  element.style.boxShadow = '';
}
