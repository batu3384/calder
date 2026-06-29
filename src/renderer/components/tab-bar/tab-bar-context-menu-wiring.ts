import { applyTabContextMenuSemantics } from './tab-bar-menu-semantics.js';

export interface TabBarContextMenuWiring {
  getActiveContextMenu: () => HTMLElement | null;
  setActiveContextMenu: (menu: HTMLElement | null) => void;
  hideTabContextMenu: () => void;
  applyContextMenuSemantics: (menu: HTMLElement, label: string, focusFirstItem?: boolean) => void;
}

export function createTabBarContextMenuWiring(): TabBarContextMenuWiring {
  let activeContextMenu: HTMLElement | null = null;

  function setActiveContextMenu(menu: HTMLElement | null): void {
    activeContextMenu = menu;
  }

  function hideTabContextMenu(): void {
    if (activeContextMenu) {
      activeContextMenu.remove();
      activeContextMenu = null;
    }
  }

  function applyContextMenuSemantics(
    menu: HTMLElement,
    label: string,
    focusFirstItem = true,
  ): void {
    applyTabContextMenuSemantics(menu, label, hideTabContextMenu, focusFirstItem);
  }

  function getActiveContextMenu(): HTMLElement | null {
    return activeContextMenu;
  }

  return {
    getActiveContextMenu,
    setActiveContextMenu,
    hideTabContextMenu,
    applyContextMenuSemantics,
  };
}
