import { createCustomSelect } from './custom-select.js';

export interface FieldDef {
  label: string;
  id: string;
  type?: 'text' | 'checkbox' | 'select';
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
  buttonLabel?: string;
  onButtonClick?: (input: HTMLInputElement) => void;
  onChange?: (checked: boolean) => void;
}

const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel')!;
const btnConfirm = document.getElementById('modal-confirm')!;
let restoreFocusAfterClose: HTMLElement | null = null;
let modalCleanupHandler: (() => void) | null = null;
let selectCleanupHandlers: Array<() => void> = [];

type InertCapableElement = HTMLElement & { inert?: boolean };

function getAppShell(): InertCapableElement | null {
  return document.getElementById('app') as InertCapableElement | null;
}

function setAppShellModalState(active: boolean): void {
  const appShell = getAppShell();
  if (!appShell) return;
  appShell.inert = active;
  if (active) {
    appShell.setAttribute('aria-hidden', 'true');
  } else {
    appShell.removeAttribute('aria-hidden');
  }
}

function getFocusableModalElements(): HTMLElement[] {
  return Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function focusInitialModalTarget(): void {
  const firstTextInput = bodyEl.querySelector('input[type="text"]') as HTMLInputElement | null;
  if (firstTextInput) {
    requestAnimationFrame(() => {
      firstTextInput.focus();
      firstTextInput.select();
    });
    return;
  }

  const [firstFocusable] = getFocusableModalElements();
  requestAnimationFrame(() => {
    (firstFocusable ?? modal).focus();
  });
}

export function runModalCleanup(): void {
  if (modalCleanupHandler) {
    const handler = modalCleanupHandler;
    modalCleanupHandler = null;
    handler();
  }
  if (selectCleanupHandlers.length > 0) {
    const handlers = selectCleanupHandlers;
    selectCleanupHandlers = [];
    for (const handler of handlers) {
      handler();
    }
  }
}

export function registerModalCleanup(handler: () => void): void {
  modalCleanupHandler = handler;
}

export function extendModalCleanup(handler: () => void): void {
  const previous = modalCleanupHandler;
  modalCleanupHandler = () => {
    previous?.();
    handler();
  };
}

export function registerModalSelectCleanup(handler: () => void): void {
  selectCleanupHandlers.push(handler);
}

export function prepareModalSurface(): void {
  restoreFocusAfterClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('modal-surface');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'modal-title');
  modal.tabIndex = -1;
  setAppShellModalState(true);
}

export function setModalError(fieldId: string, message: string): void {
  const existing = bodyEl.querySelector(`#modal-error-${fieldId}`);
  if (existing) existing.remove();

  if (!message) return;

  const input = document.getElementById(`modal-${fieldId}`);
  if (!input) return;

  const errEl = document.createElement('div');
  errEl.id = `modal-error-${fieldId}`;
  errEl.className = 'modal-error';
  errEl.textContent = message;
  input.parentElement!.appendChild(errEl);
}

export function closeModal(): void {
  overlay.classList.add('hidden');
  delete overlay.dataset.modalView;
  runModalCleanup();
  modal.classList.remove('modal-surface');
  setAppShellModalState(false);
  restoreFocusAfterClose?.focus?.();
  restoreFocusAfterClose = null;
}

export function showModal(
  title: string,
  fields: FieldDef[],
  onConfirm: (values: Record<string, string>) => void | Promise<void>
): void {
  // Clean up previous listeners before building a new modal body.
  runModalCleanup();
  prepareModalSurface();
  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  overlay.dataset.modalView = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  for (const field of fields) {
    const div = document.createElement('div');
    div.className = field.type === 'checkbox' ? 'modal-field modal-field-checkbox' : 'modal-field';

    const label = document.createElement('label');
    label.setAttribute('for', `modal-${field.id}`);
    label.textContent = field.label;

    const input = document.createElement('input');
    input.id = `modal-${field.id}`;

    if (field.type === 'checkbox') {
      input.type = 'checkbox';
      if (field.defaultValue === 'true') input.checked = true;
      if (field.onChange) {
        input.addEventListener('change', () => field.onChange!(input.checked));
      }
      div.appendChild(input);
      div.appendChild(label);
    } else if (field.type === 'select') {
      div.appendChild(label);
      const sel = createCustomSelect(`modal-${field.id}`, field.options ?? [], field.defaultValue);
      div.appendChild(sel.element);
      registerModalSelectCleanup(() => sel.destroy());
    } else {
      input.type = 'text';
      input.placeholder = field.placeholder ?? '';
      input.value = field.defaultValue ?? '';
      div.appendChild(label);

      if (field.buttonLabel && field.onButtonClick) {
        div.classList.add('modal-field-has-action');
        const row = document.createElement('div');
        row.className = 'modal-field-row';
        row.appendChild(input);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'modal-field-btn';
        btn.textContent = field.buttonLabel;
        btn.addEventListener('click', () => field.onButtonClick!(input));
        row.appendChild(btn);
        div.appendChild(row);
      } else {
        div.appendChild(input);
      }
    }

    bodyEl.appendChild(div);
  }

  overlay.classList.remove('hidden');
  focusInitialModalTarget();

  const handleConfirm = async () => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const el = document.getElementById(`modal-${field.id}`) as HTMLInputElement | HTMLSelectElement;
      if (field.type === 'checkbox') {
        values[field.id] = String((el as HTMLInputElement)?.checked ?? false);
      } else {
        values[field.id] = el?.value ?? '';
      }
    }
    await onConfirm(values);
  };

  const handleCancel = () => {
    closeModal();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusable = getFocusableModalElements();
      if (focusable.length === 0) {
        e.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (e.shiftKey) {
        if (!active || active === first || active === modal) {
          e.preventDefault();
          last.focus();
        }
      } else if (!active || active === last || active === modal) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  btnConfirm.addEventListener('click', handleConfirm);
  btnCancel.addEventListener('click', handleCancel);
  overlay.addEventListener('keydown', handleKeydown);

  registerModalCleanup(() => {
    btnConfirm.removeEventListener('click', handleConfirm);
    btnCancel.removeEventListener('click', handleCancel);
    overlay.removeEventListener('keydown', handleKeydown);
  });
}
