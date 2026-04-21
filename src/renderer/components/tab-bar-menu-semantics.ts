export function applyTabContextMenuSemantics(
  menu: HTMLElement,
  label: string,
  onEscape: () => void,
  focusFirstItem = true,
): void {
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);

  const isInteractive = (item: HTMLElement): boolean => (
    !item.classList.contains('disabled')
    && !item.classList.contains('active')
    && item.getAttribute('aria-disabled') !== 'true'
  );
  const getEnabledItems = (): HTMLElement[] => Array
    .from(menu.querySelectorAll<HTMLElement>('.tab-context-menu-item'))
    .filter(isInteractive);

  for (const item of menu.querySelectorAll<HTMLElement>('.tab-context-menu-item')) {
    const interactive = isInteractive(item);
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-disabled', interactive ? 'false' : 'true');
    item.tabIndex = -1;
  }

  for (const separator of menu.querySelectorAll<HTMLElement>('.tab-context-menu-separator')) {
    separator.setAttribute('role', 'separator');
  }

  const focusItemAt = (index: number, enabledItems: HTMLElement[]): void => {
    if (enabledItems.length === 0) return;
    const normalized = (index + enabledItems.length) % enabledItems.length;
    enabledItems[normalized]?.focus();
  };

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    ) return;

    const enabledItems = getEnabledItems();
    if (enabledItems.length === 0) return;
    const focusedIndex = enabledItems.findIndex((item) => item === document.activeElement);
    if (event.key === 'Enter' || event.key === ' ') {
      if (document.activeElement instanceof HTMLElement && isInteractive(document.activeElement)) {
        event.preventDefault();
        document.activeElement.click();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(focusedIndex < 0 ? 0 : focusedIndex + 1, enabledItems);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(focusedIndex < 0 ? enabledItems.length - 1 : focusedIndex - 1, enabledItems);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItemAt(0, enabledItems);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItemAt(enabledItems.length - 1, enabledItems);
    } else if (event.key === 'Tab') {
      onEscape();
    }
  });

  if (focusFirstItem) {
    requestAnimationFrame(() => {
      getEnabledItems()[0]?.focus();
    });
  }
}
