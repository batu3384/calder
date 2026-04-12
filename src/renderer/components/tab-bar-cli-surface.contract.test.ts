import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');

describe('tab bar cli surface contract', () => {
  it('exposes dedicated top-deck slots for surface mode and cli profiles', () => {
    expect(htmlSource).toContain('surface-mode-slot');
    expect(htmlSource).toContain('surface-profile-slot');
  });

  it('renders a top-deck surface switcher and cli profile controls from the tab bar', () => {
    expect(tabBarSource).toContain('renderSurfaceControls');
    expect(tabBarSource).toContain('surface-mode-slot');
    expect(tabBarSource).toContain('surface-profile-slot');
    expect(tabBarSource).toContain('promptCliSurfaceProfile');
    expect(tabBarSource).toContain('openCliSurfaceWithSetup');
    expect(tabBarSource).toContain('showCliSurfaceQuickSetup');
    expect(tabBarSource).toContain("label: 'Live View'");
    expect(tabBarSource).toContain("label: 'CLI Surface'");
  });

  it('styles the switcher as an inline command-deck control instead of a modal-only affordance', () => {
    expect(tabsCss).toContain('.surface-mode-switcher');
    expect(tabsCss).toContain('.surface-mode-button');
    expect(tabsCss).toContain('.surface-profile-group');
  });
});
