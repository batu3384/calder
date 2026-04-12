import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const mainMenuSource = readFileSync(new URL('./menu.ts', import.meta.url), 'utf-8');
const preloadSource = readFileSync(new URL('../preload/preload.ts', import.meta.url), 'utf-8');
const keybindingsSource = readFileSync(new URL('../renderer/keybindings.ts', import.meta.url), 'utf-8');

describe('control panel menu contract', () => {
  it('keeps the main, preload, and renderer channel names aligned', () => {
    expect(mainMenuSource).toContain("sendToRenderer('menu:toggle-context-panel')");
    expect(preloadSource).toContain("onToggleContextPanel: (cb) => onChannel('menu:toggle-context-panel', cb)");
    expect(keybindingsSource).toContain("window.calder.menu.onToggleContextPanel(() => toggleContextInspector())");
  });
});
