import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const menuSemanticsSource = readFileSync(new URL('./tab-bar-menu-semantics.ts', import.meta.url), 'utf-8');
const sessionContextMenuSource = readFileSync(new URL('./tab-bar-session-context-menu.ts', import.meta.url), 'utf-8');
const providerSelectorSource = readFileSync(
  new URL('./tab-bar-provider-selector-controller.ts', import.meta.url),
  'utf-8',
);
const surfaceControlsSource = readFileSync(
  new URL('./tab-bar-surface-controls.ts', import.meta.url),
  'utf-8',
);
const branchMenuSource = readFileSync(
  new URL('./tab-bar-branch-menu-controller.ts', import.meta.url),
  'utf-8',
);
const sessionMenuSource = readFileSync(
  new URL('./tab-bar-session-menu-controller.ts', import.meta.url),
  'utf-8',
);
const sidebarSource = readFileSync(new URL('./sidebar.ts', import.meta.url), 'utf-8');
const historySource = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const gitSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const selectSource = readFileSync(new URL('./custom-select.ts', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('../styles/primitives.css', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');
const modalsCss = readFileSync(new URL('../styles/modals.css', import.meta.url), 'utf-8');

describe('menu surface contract', () => {
  it('routes context menus and dropdowns through the shared floating menu shell', () => {
    expect(tabBarSource).toContain("from './tab-bar-session-context-menu.js'");
    expect(tabBarSource).toContain('showSessionTabContextMenu({');
    expect(sessionContextMenuSource).toContain('tab-context-menu calder-floating-list');
    expect(menuSemanticsSource).toContain("menu.setAttribute('role', 'menu')");
    expect(menuSemanticsSource).toContain("item.setAttribute('role', 'menuitem')");
    expect(sessionContextMenuSource).toContain("applyContextMenuSemantics(menu, 'Session actions'");
    expect(tabBarSource).toContain('createTabBarBranchMenuController');
    expect(tabBarSource).toContain('createTabBarSessionMenuController');
    expect(providerSelectorSource).toContain("'command-deck-provider'");
    expect(branchMenuSource).toContain('tab-context-menu calder-floating-list');
    expect(branchMenuSource).toContain('branch-search-input');
    expect(branchMenuSource).toContain("applyContextMenuSemantics(menu, 'Branch actions', false)");
    expect(sessionMenuSource).toContain('tab-context-menu calder-floating-list');
    expect(sessionMenuSource).toContain("applyContextMenuSemantics(menu, 'New session actions')");
    expect(sessionMenuSource).toContain('Join Remote Session');
    expect(providerSelectorSource).toContain("floating: {");
    expect(surfaceControlsSource).toContain("floating: {");
    expect(providerSelectorSource).not.toContain('floating: false');
    expect(surfaceControlsSource).not.toContain('floating: false');
    expect(sidebarSource).toContain('tab-context-menu calder-floating-list');
    expect(historySource).toContain('tab-context-menu calder-floating-list');
    expect(gitSource).toContain('tab-context-menu calder-floating-list');
    expect(sidebarSource).toContain('path-autocomplete-dropdown calder-floating-list');
    expect(selectSource).toContain('custom-select-dropdown calder-floating-list');
  });

  it('keeps menu surface styling aligned with the shared shell', () => {
    expect(primitives).toContain('.calder-floating-list');
    expect(tabsCss).toContain('.tab-context-menu.calder-floating-list');
    expect(modalsCss).toContain('.custom-select-dropdown.calder-floating-list');
    expect(modalsCss).toContain('.path-autocomplete-dropdown.calder-floating-list');
  });
});
