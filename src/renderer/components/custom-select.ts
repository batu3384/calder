import { anchorFloatingSurface, type FloatingSurfaceOptions } from './floating-surface.js';
import { logDebugEvent } from './debug-panel.js';

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

export function createCustomSelect(
  id: string,
  options: SelectOption[],
  defaultValue?: string,
  config: CustomSelectConfig = {},
): CustomSelectInstance {
  const defaultOpt = options.find(o => o.value === defaultValue) ?? options.find(o => !o.disabled) ?? options[0];
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
  const items: HTMLElement[] = [];
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

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const item = document.createElement('div');
    item.className = 'custom-select-item';
    item.textContent = opt.label;
    item.dataset.value = opt.value;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(opt.value === hidden.value));
    if (opt.disabled) item.classList.add('disabled');
    if (opt.value === hidden.value) item.classList.add('selected');

    item.addEventListener('mouseenter', () => {
      if (!opt.disabled) {
        activeIndex = i;
        updateActive();
      }
    });

    item.addEventListener('click', () => {
      if (!opt.disabled) selectOption(i);
    });

    items.push(item);
    dropdown.appendChild(item);
  }

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
    activeIndex = options.findIndex(o => o.value === hidden.value);
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
    items.forEach(el => el.classList.remove('active'));
    if (wasOpen) {
      config.onOpenChange?.(false);
      traceDropdownEvent('close', reason);
    }
  }

  function isOpen(): boolean {
    return dropdown.classList.contains('visible');
  }

  trigger.addEventListener('click', () => {
    if (isOpen()) closeDropdown('trigger-toggle');
    else openDropdown('trigger-toggle');
  });

  trigger.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!isOpen()) openDropdown('keyboard-arrow');
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      let next = activeIndex;
      for (let attempt = 0; attempt < options.length; attempt++) {
        next = (next + dir + options.length) % options.length;
        if (!options[next].disabled) {
          activeIndex = next;
          break;
        }
      }
      updateActive();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen() && activeIndex >= 0) selectOption(activeIndex, 'keyboard-enter');
      else if (!isOpen()) openDropdown('keyboard-enter');
    } else if (e.key === 'Escape') {
      if (isOpen()) {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown('keyboard-escape');
      }
    } else if (e.key === 'Tab') {
      closeDropdown('keyboard-tab');
    }
  });

  function eventTargetsCurrentSelect(event: Event): boolean {
    const composedPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (composedPath.includes(wrapper) || composedPath.includes(dropdown) || composedPath.includes(trigger)) {
      return true;
    }
    const target = event.target as Node | null;
    return Boolean(
      target
      && (
        wrapper.contains(target)
        || dropdown.contains(target)
        || trigger.contains(target)
      )
    );
  }

  const onOutsidePointerDown = (event: PointerEvent | MouseEvent) => {
    if (!isOpen()) return;
    if (eventTargetsCurrentSelect(event)) return;
    closeDropdown('outside-press');
  };
  const outsidePressEventName: 'pointerdown' | 'mousedown' = (
    typeof window !== 'undefined' && 'PointerEvent' in window
  ) ? 'pointerdown' : 'mousedown';
  document.addEventListener(outsidePressEventName, onOutsidePointerDown);

  const initialIndex = options.findIndex(o => o.value === hidden.value);
  if (initialIndex >= 0) {
    applySelectedIndex(initialIndex);
  }

  wrapper.appendChild(hidden);
  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);

  return {
    element: wrapper,
    getValue() { return hidden.value; },
    setValue(value: string) {
      const previousValue = hidden.value;
      const nextIndex = options.findIndex(opt => opt.value === value && !opt.disabled);
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
      document.removeEventListener(outsidePressEventName, onOutsidePointerDown);
      document.removeEventListener('pointerdown', onOutsidePointerDown);
      document.removeEventListener('mousedown', onOutsidePointerDown);
    },
  };
}
