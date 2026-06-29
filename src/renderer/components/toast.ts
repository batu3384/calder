/**
 * Toast/Notification system.
 * Provides non-blocking notifications with auto-dismiss.
 */

import { announcePolite } from './focus-management.js';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastInstance {
  dismiss(): void;
  destroy(): void;
  element: HTMLElement | null;
}

let toastContainer: HTMLElement | null = null;
let activeToasts: ToastInstance[] = [];

function isDocumentReady(): boolean {
  return (
    typeof document !== 'undefined' &&
    document !== null &&
    typeof document.createElement === 'function' &&
    typeof document.getElementById === 'function' &&
    typeof document.body !== 'undefined'
  );
}

function getToastContainer(): HTMLElement | null {
  if (toastContainer) return toastContainer;

  if (!isDocumentReady()) {
    return null;
  }

  const existing = document.getElementById('calder-toast-container');
  if (existing) {
    toastContainer = existing;
    return toastContainer;
  }

  const container = document.createElement('div');
  container.id = 'calder-toast-container';
  container.className = 'calder-toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(container);
  toastContainer = container;
  return container;
}

function getToastIcon(type: ToastType): string {
  switch (type) {
    case 'success':
      return '\u2713';
    case 'error':
      return '\u2717';
    case 'warning':
      return '!';
    case 'info':
      return 'i';
  }
}

function createToastEl(options: ToastOptions, instance: ToastInstance): HTMLElement {
  const { message, type = 'info', action } = options;

  const toast = document.createElement('div');
  toast.className = `calder-toast ${type}`;

  const icon = document.createElement('span');
  icon.className = 'calder-toast-icon';
  icon.textContent = getToastIcon(type);
  toast.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'calder-toast-content';

  const msg = document.createElement('span');
  msg.className = 'calder-toast-message';
  msg.textContent = message;
  content.appendChild(msg);

  if (action) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'calder-toast-action';
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.onClick();
      instance.dismiss();
    });
    actionDiv.appendChild(btn);
    content.appendChild(actionDiv);
  }

  toast.appendChild(content);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'calder-toast-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.addEventListener('click', () => instance.dismiss());
  toast.appendChild(closeBtn);

  return toast;
}

export function showToast(options: ToastOptions): ToastInstance {
  // Guard against non-browser environments (SSR, tests)
  if (!isDocumentReady()) {
    return { dismiss: () => {}, destroy: () => {}, element: null };
  }

  const container = getToastContainer();
  if (!container) {
    return { dismiss: () => {}, destroy: () => {}, element: null };
  }

  const { duration = 4000 } = options;

  let dismissTimer: ReturnType<typeof setTimeout> | null = null;
  let isRemoving = false;

  const toastInstance: ToastInstance = {
    element: null,
    dismiss() {
      if (isRemoving) return;
      isRemoving = true;

      if (dismissTimer !== null) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }

      const toastEl = toastInstance.element;
      if (toastEl) {
        toastEl.classList.add('removing');
        setTimeout(() => {
          toastEl.remove();
          activeToasts = activeToasts.filter((t) => t !== toastInstance);
        }, 150);
      }
    },
    destroy() {
      this.dismiss();
    },
  };

  const toastEl = createToastEl(options, toastInstance);
  toastInstance.element = toastEl;
  container.appendChild(toastEl);
  activeToasts.push(toastInstance);
  announcePolite(options.message);

  if (duration > 0 && typeof window !== 'undefined') {
    dismissTimer = window.setTimeout(() => {
      toastInstance.dismiss();
    }, duration);
  }

  return toastInstance;
}

export function showSuccessToast(message: string, duration?: number): ToastInstance {
  return showToast({ message, type: 'success', duration });
}

export function showErrorToast(message: string, duration = 6000): ToastInstance {
  return showToast({ message, type: 'error', duration });
}

export function showWarningToast(message: string, duration?: number): ToastInstance {
  return showToast({ message, type: 'warning', duration });
}

export function showInfoToast(message: string, duration?: number): ToastInstance {
  return showToast({ message, type: 'info', duration });
}

export function dismissAllToasts(): void {
  // Copy the array before iterating — dismiss() mutates activeToasts.
  [...activeToasts].forEach((t) => t.dismiss());
}

export function resetToastForTesting(): void {
  toastContainer = null;
  activeToasts = [];
}
