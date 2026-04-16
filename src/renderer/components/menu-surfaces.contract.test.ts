import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const sidebarSource = readFileSync(new URL('./sidebar.ts', import.meta.url), 'utf-8');
const historySource = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const gitSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const selectSource = readFileSync(new URL('./custom-select.ts', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('../styles/primitives.css', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');
const modalsCss = readFileSync(new URL('../styles/modals.css', import.meta.url), 'utf-8');

describe('menu surface contract', () => {
  it('routes context menus and dropdowns through the shared floating menu shell', () => {
    expect(tabBarSource).toContain('tab-context-menu calder-floating-list');
    expect(tabBarSource).toContain("menu.setAttribute('role', 'menu')");
    expect(tabBarSource).toContain("item.setAttribute('role', 'menuitem')");
    expect(tabBarSource).toContain('applyContextMenuSemantics(menu,');
    expect(tabBarSource).toContain("'command-deck-provider'");
    expect(tabBarSource).toContain("floating: {");
    expect(tabBarSource).not.toContain('floating: false');
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
