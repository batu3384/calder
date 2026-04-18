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
    expect(tabBarSource).toContain('focusCliSurfaceTab');
    expect(tabBarSource).toContain('focusMobileSurfaceTab');
    expect(tabBarSource).toContain('closeCliSurface');
    expect(tabBarSource).toContain('closeMobileSurface');
    expect(tabBarSource).toContain('surface-mode-slot');
    expect(tabBarSource).toContain('surface-profile-slot');
    expect(tabBarSource).toContain('promptCliSurfaceProfile');
    expect(tabBarSource).toContain('openCliSurfaceWithSetup');
    expect(tabBarSource).toContain('showCliSurfaceQuickSetup');
    expect(tabBarSource).toContain("label: 'Live View'");
    expect(tabBarSource).toContain("label: 'CLI Surface'");
    expect(tabBarSource).toContain("label: 'Mobile'");
    expect(tabBarSource).toContain('tab-cli-surface-badge');
  });

  it('styles the switcher as an inline command-deck control instead of a modal-only affordance', () => {
    expect(tabsCss).toContain('.surface-mode-switcher');
    expect(tabsCss).toContain('.surface-mode-button');
    expect(tabsCss).toContain('.surface-profile-group');
    expect(tabsCss).toContain('.tab-cli-surface-badge');
  });

  it('keeps session actions and surface controls in one steady control family', () => {
    expect(tabsCss).toContain('.tab-item.active');
    expect(tabsCss).toContain('.tab-item:hover');
    expect(tabsCss).toContain('transform: none;');
    expect(tabsCss).toContain('.tab-action-primary');
  });

  it('styles the top deck like one polished control rail', () => {
    expect(tabsCss).toContain('.tab-bar-meta');
    expect(tabsCss).toContain('.surface-mode-switcher');
    expect(tabsCss).toContain('.surface-profile-group');
    expect(tabsCss).toContain('height: 34px;');
  });
});
