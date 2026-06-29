import { logDebugEvent } from './debug-panel.js';
import { anchorFloatingSurface, type FloatingSurfaceOptions } from './floating-surface.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectInstance {
  element: HTMLElement;
  getValue(): string;
  setValue(value: string): void;
  destroy(): void;
}

export interface CustomSelectConfig {
  floating?: FloatingSurfaceOptions | false;
  align?: 'start' | 'end';
  onOpenChange?: (open: boolean) => void;
}

function eventTargetsCurrentSelect(
  event: Event,
  wrapper: HTMLElement,
  dropdown: HTMLElement,
  trigger: HTMLElement,
): boolean {
  const composedPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (
    composedPath.includes(wrapper) ||
    composedPath.includes(dropdown) ||
    composedPath.includes(trigger)
  ) {
    return true;
  }
  const target = event.target as Node | null;
  return Boolean(
    target && (wrapper.contains(target) || dropdown.contains(target) || trigger.contains(target)),
  );
}

function createSelectItems(
  options: SelectOption[],
  hiddenValue: string,
  onHover: (index: number) => void,
  onSelect: (index: number) => void,
): HTMLElement[] {
  const items: HTMLElement[] = [];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const item = document.createElement('div');
    item.className = 'custom-select-item';
    item.textContent = opt.label;
    item.dataset.value = opt.value;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(opt.value === hiddenValue));
    if (opt.disabled) item.classList.add('disabled');
    if (opt.value === hiddenValue) item.classList.add('selected');

    item.addEventListener('mouseenter', () => {
      if (!opt.disabled) onHover(i);
    });

    item.addEventListener('click', () => {
      if (!opt.disabled) onSelect(i);
    });

    items.push(item);
  }
  return items;
}

interface SelectKeyboardHandlerArgs {
  event: KeyboardEvent;
  options: SelectOption[];
  isOpen: () => boolean;
  openDropdown: (reason: string) => void;
  closeDropdown: (reason: string) => void;
  getActiveIndex: () => number;
  setActiveIndex: (index: number) => void;
  updateActive: () => void;
  selectOption: (index: number, reason: string) => void;
}

function handleSelectTriggerKeydown({
  event,
  options,
  isOpen,
  openDropdown,
  closeDropdown,
  getActiveIndex,
  setActiveIndex,
  updateActive,
  selectOption,
}: SelectKeyboardHandlerArgs): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    if (!isOpen()) openDropdown('keyboard-arrow');
    const dir = event.key === 'ArrowDown' ? 1 : -1;
    let next = getActiveIndex();
    for (let attempt = 0; attempt < options.length; attempt++) {
      next = (next + dir + options.length) % options.length;
      if (!options[next].disabled) {
        setActiveIndex(next);
        break;
      }
    }
    updateActive();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    if (isOpen() && getActiveIndex() >= 0) selectOption(getActiveIndex(), 'keyboard-enter');
    else if (!isOpen()) openDropdown('keyboard-enter');
    return;
  }
  if (event.key === 'Escape') {
    if (isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      closeDropdown('keyboard-escape');
    }
    return;
  }
  if (event.key === 'Tab') {
    closeDropdown('keyboard-tab');
  }
}

interface OutsidePressHandlerArgs {
  wrapper: HTMLElement;
  dropdown: HTMLElement;
  trigger: HTMLElement;
  isOpen: () => boolean;
  closeDropdown: (reason: string) => void;
}

function registerOutsidePressHandler({
  wrapper,
  dropdown,
  trigger,
  isOpen,
  closeDropdown,
}: OutsidePressHandlerArgs): () => void {
  const onOutsidePointerDown = (event: PointerEvent | MouseEvent) => {
    if (!isOpen()) return;
    if (eventTargetsCurrentSelect(event, wrapper, dropdown, trigger)) return;
    closeDropdown('outside-press');
  };
  const outsidePressEventName: 'pointerdown' | 'mousedown' =
    typeof window !== 'undefined' && 'PointerEvent' in window ? 'pointerdown' : 'mousedown';
  document.addEventListener(outsidePressEventName, onOutsidePointerDown);
  return () => {
    document.removeEventListener(outsidePressEventName, onOutsidePointerDown);
    document.removeEventListener('pointerdown', onOutsidePointerDown);
    document.removeEventListener('mousedown', onOutsidePointerDown);
  };
}

interface RegisterSelectTriggerHandlersArgs {
  trigger: HTMLButtonElement;
  options: SelectOption[];
  isOpen: () => boolean;
  openDropdown: (reason: string) => void;
  closeDropdown: (reason: string) => void;
  getActiveIndex: () => number;
  setActiveIndex: (index: number) => void;
  updateActive: () => void;
  selectOption: (index: number, reason: string) => void;
}

function registerSelectTriggerHandlers({
  trigger,
  options,
  isOpen,
  openDropdown,
  closeDropdown,
  getActiveIndex,
  setActiveIndex,
  updateActive,
  selectOption,
}: RegisterSelectTriggerHandlersArgs): void {
  trigger.addEventListener('click', () => {
    if (isOpen()) closeDropdown('trigger-toggle');
    else openDropdown('trigger-toggle');
  });

  trigger.addEventListener('keydown', (event: KeyboardEvent) => {
    handleSelectTriggerKeydown({
      event,
      options,
      isOpen,
      openDropdown,
      closeDropdown,
      getActiveIndex,
      setActiveIndex,
      updateActive,
      selectOption,
    });
  });
}

function initializeSelectValue(
  options: SelectOption[],
  currentValue: string,
  applySelectedIndex: (index: number) => void,
): void {
  const initialIndex = options.findIndex((o) => o.value === currentValue);
  if (initialIndex >= 0) {
    applySelectedIndex(initialIndex);
  }
}

function mountSelectElements(
  wrapper: HTMLElement,
  hidden: HTMLInputElement,
  trigger: HTMLButtonElement,
  dropdown: HTMLElement,
): void {
  wrapper.appendChild(hidden);
  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);
}

interface BuildCustomSelectInstanceArgs {
  wrapper: HTMLElement;
  hidden: HTMLInputElement;
  options: SelectOption[];
  applySelectedIndex: (index: number) => void;
  traceDropdownEvent: (
    event: 'open' | 'close' | 'change',
    reason: string,
    data?: Record<string, unknown>,
  ) => void;
  closeDropdown: (reason: string) => void;
  cleanupOutsidePressHandler: () => void;
}

function buildCustomSelectInstance({
  wrapper,
  hidden,
  options,
  applySelectedIndex,
  traceDropdownEvent,
  closeDropdown,
  cleanupOutsidePressHandler,
}: BuildCustomSelectInstanceArgs): CustomSelectInstance {
  return {
    element: wrapper,
    getValue() {
      return hidden.value;
    },
    setValue(value: string) {
      const previousValue = hidden.value;
      const nextIndex = options.findIndex((opt) => opt.value === value && !opt.disabled);
      if (nextIndex >= 0) {
        applySelectedIndex(nextIndex);
        if (previousValue !== hidden.value) {
          traceDropdownEvent('change', 'set-value', {
            previousValue,
            nextValue: options[nextIndex]?.value,
            index: nextIndex,
          });
        }
      }
    },
    destroy() {
      closeDropdown('destroy');
      cleanupOutsidePressHandler();
    },
  };
}

export function createCustomSelect(
  id: string,
  options: SelectOption[],
  defaultValue?: string,
  config: CustomSelectConfig = {},
): CustomSelectInstance {
  const defaultOpt =
    options.find((o) => o.value === defaultValue) ?? options.find((o) => !o.disabled) ?? options[0];
  const usesFloatingSurface = config.floating !== false;
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  wrapper.dataset.state = 'closed';
  wrapper.dataset.floating = config.floating === false ? 'inline' : 'floating';
  wrapper.dataset.align = config.align ?? 'start';
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = id;
  hidden.value = defaultOpt?.value ?? '';
  wrapper.dataset.value = hidden.value;
  wrapper.dataset.provider = hidden.value;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.textContent = defaultOpt?.label ?? '';
  trigger.dataset.provider = hidden.value;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown calder-floating-list';
  dropdown.setAttribute('role', 'listbox');
  let activeIndex = -1;
  let floatingCleanup: (() => void) | null = null;
  let items: HTMLElement[] = [];
  const debugSessionId = `custom-select:${id}`;

  function ensureFloatingDropdownHost(): void {
    if (!usesFloatingSurface) return;
    dropdown.classList.add('custom-select-dropdown-floating');
    for (const className of wrapper.classList) {
      if (className === 'custom-select') continue;
      dropdown.classList.add(className);
    }
    if (dropdown.parentElement !== document.body) {
      document.body.appendChild(dropdown);
    }
  }

  function restoreDropdownHost(): void {
    if (!usesFloatingSurface) return;
    if (dropdown.parentElement !== wrapper) {
      wrapper.appendChild(dropdown);
    }
  }
  items = createSelectItems(
    options,
    hidden.value,
    (index) => {
      activeIndex = index;
      updateActive();
    },
    (index) => selectOption(index),
  );
  items.forEach((item) => dropdown.appendChild(item));
  function applySelectedIndex(index: number): void {
    const opt = options[index];
    if (!opt) return;
    hidden.value = opt.value;
    wrapper.dataset.value = hidden.value;
    wrapper.dataset.provider = hidden.value;
    trigger.textContent = opt.label;
    trigger.dataset.provider = hidden.value;
    items.forEach((el, itemIndex) => {
      el.classList.toggle('selected', itemIndex === index);
      el.setAttribute('aria-selected', String(itemIndex === index));
    });
  }
  function traceDropdownEvent(
    event: 'open' | 'close' | 'change',
    reason: string,
    data?: Record<string, unknown>,
  ): void {
    logDebugEvent('uiDropdown', debugSessionId, {
      event,
      reason,
      value: hidden.value,
      ...data,
    });
  }
  function selectOption(index: number, reason = 'select'): void {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    const prevValue = hidden.value;
    applySelectedIndex(index);
    if (prevValue !== opt.value) {
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      traceDropdownEvent('change', reason, {
        previousValue: prevValue,
        nextValue: opt.value,
        index,
      });
    }
    closeDropdown(`select:${reason}`);
  }
  function updateActive(): void {
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0) items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }
  function openDropdown(reason = 'programmatic'): void {
    if (isOpen()) return;
    const triggerWidth = Math.ceil(trigger.getBoundingClientRect().width);
    dropdown.style.minWidth = `${Math.max(triggerWidth, 120)}px`;
    dropdown.style.width = 'max-content';
    ensureFloatingDropdownHost();
    dropdown.classList.add('visible');
    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    wrapper.dataset.state = 'open';
    activeIndex = options.findIndex((o) => o.value === hidden.value);
    if (usesFloatingSurface) {
      floatingCleanup?.();
      floatingCleanup = anchorFloatingSurface(trigger, dropdown, {
        placement: 'bottom-start',
        offsetPx: 6,
        maxWidthPx: 360,
        maxHeightPx: 320,
        ...config.floating,
      });
    }
    updateActive();
    config.onOpenChange?.(true);
    traceDropdownEvent('open', reason, {
      floating: usesFloatingSurface,
      align: config.align ?? 'start',
    });
  }
  function closeDropdown(reason = 'programmatic'): void {
    const wasOpen = isOpen();
    floatingCleanup?.();
    floatingCleanup = null;
    dropdown.classList.remove('visible');
    restoreDropdownHost();
    trigger.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    wrapper.dataset.state = 'closed';
    activeIndex = -1;
    items.forEach((el) => el.classList.remove('active'));
    if (wasOpen) {
      config.onOpenChange?.(false);
      traceDropdownEvent('close', reason);
    }
  }
  function isOpen(): boolean {
    return dropdown.classList.contains('visible');
  }
  registerSelectTriggerHandlers({
    trigger,
    options,
    isOpen,
    openDropdown,
    closeDropdown,
    getActiveIndex: () => activeIndex,
    setActiveIndex: (index) => {
      activeIndex = index;
    },
    updateActive,
    selectOption,
  });
  const cleanupOutsidePressHandler = registerOutsidePressHandler({
    wrapper,
    dropdown,
    trigger,
    isOpen,
    closeDropdown,
  });
  initializeSelectValue(options, hidden.value, applySelectedIndex);
  mountSelectElements(wrapper, hidden, trigger, dropdown);
  return buildCustomSelectInstance({
    wrapper,
    hidden,
    options,
    applySelectedIndex,
    traceDropdownEvent,
    closeDropdown,
    cleanupOutsidePressHandler,
  });
}
