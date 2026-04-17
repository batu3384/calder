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

  function selectOption(index: number): void {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    const prevValue = hidden.value;
    applySelectedIndex(index);
    if (prevValue !== opt.value) {
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeDropdown();
  }

  function updateActive(): void {
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0) items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function openDropdown(): void {
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
  }

  function closeDropdown(): void {
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
    }
  }

  function isOpen(): boolean {
    return dropdown.classList.contains('visible');
  }

  trigger.addEventListener('click', () => {
    if (isOpen()) closeDropdown();
    else openDropdown();
  });

  trigger.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!isOpen()) openDropdown();
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
      if (isOpen() && activeIndex >= 0) selectOption(activeIndex);
      else if (!isOpen()) openDropdown();
    } else if (e.key === 'Escape') {
      if (isOpen()) {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown();
      }
    } else if (e.key === 'Tab') {
      closeDropdown();
    }
  });

  function eventTargetsCurrentSelect(event: PointerEvent): boolean {
    const composedPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (composedPath.includes(wrapper) || composedPath.includes(dropdown) || composedPath.includes(trigger)) {
      return true;
    }
    const target = event.target as Node | null;
    return Boolean(target && wrapper.contains(target));
  }

  const onOutsidePointerDown = (event: PointerEvent) => {
    if (!isOpen()) return;
    if (eventTargetsCurrentSelect(event)) return;
    closeDropdown();
  };
  document.addEventListener('pointerdown', onOutsidePointerDown);

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
      const nextIndex = options.findIndex(opt => opt.value === value && !opt.disabled);
      if (nextIndex >= 0) {
        applySelectedIndex(nextIndex);
      }
    },
    destroy() {
      closeDropdown();
      document.removeEventListener('pointerdown', onOutsidePointerDown);
    },
  };
}
