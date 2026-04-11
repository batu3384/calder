import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');
const menuSource = readFileSync(new URL('../../main/menu.ts', import.meta.url), 'utf-8');
const shortcutsSource = readFileSync(new URL('../shortcuts.ts', import.meta.url), 'utf-8');
const keybindingsSource = readFileSync(new URL('../keybindings.ts', import.meta.url), 'utf-8');
const preloadSource = readFileSync(new URL('../../preload/preload.ts', import.meta.url), 'utf-8');
const rendererTypesSource = readFileSync(new URL('../types.ts', import.meta.url), 'utf-8');
const stateSource = readFileSync(new URL('../state.ts', import.meta.url), 'utf-8');

describe('tab bar single-layout contract', () => {
  it('does not expose a dedicated layout toggle in the command deck', () => {
    expect(htmlSource).not.toContain('btn-toggle-swarm');
    expect(tabBarSource).not.toContain('btnToggleSwarm');
    expect(tabBarSource).not.toContain('setMosaicPreset');
  });

  it('does not ship layout-toggle styling once browser-left mode is the only UI path', () => {
    expect(tabsCss).not.toContain('#btn-toggle-swarm');
  });

  it('does not expose legacy split-mode controls in menus, shortcuts, or preload APIs', () => {
    expect(menuSource).not.toContain('Toggle Split Mode');
    expect(menuSource).not.toContain('menu:toggle-split');
    expect(shortcutsSource).not.toContain("'toggle-split'");
    expect(keybindingsSource).not.toContain('onToggleSplit');
    expect(preloadSource).not.toContain('onToggleSplit');
    expect(rendererTypesSource).not.toContain('onToggleSplit');
    expect(stateSource).not.toContain('toggleSwarm(): void');
    expect(stateSource).not.toContain('toggleSplit(): void');
  });
});
