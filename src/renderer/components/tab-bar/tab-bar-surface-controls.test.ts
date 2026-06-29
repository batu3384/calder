import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const surfaceControlsSource = readFileSync(new URL('./tab-bar-surface-controls.ts', import.meta.url), 'utf-8');

describe('tab bar surface controls extraction', () => {
  it('delegates top-deck surface controls to a dedicated controller', () => {
    expect(tabBarSource).toContain("from './tab-bar-surface-controls.js'");
    expect(tabBarSource).toContain('createTabBarSurfaceControlsController({');
    expect(tabBarSource).toContain('getSurfaceControlsController().renderSurfaceControls();');
    expect(tabBarSource).not.toContain('let surfaceProfileSelect: CustomSelectInstance | null = null;');
    expect(tabBarSource).not.toContain('createCustomSelect(');
  });

  it('keeps surface switcher, cli profile selector, and signature stability in the controller', () => {
    expect(surfaceControlsSource).toContain('surface-mode-switcher');
    expect(surfaceControlsSource).toContain('surface-mode-button');
    expect(surfaceControlsSource).toContain("label: 'Live View'");
    expect(surfaceControlsSource).toContain("label: 'CLI Surface'");
    expect(surfaceControlsSource).toContain("label: 'Mobile'");
    expect(surfaceControlsSource).toContain('command-deck-cli-profile');
    expect(surfaceControlsSource).toContain('command-deck-cli-profile-select');
    expect(surfaceControlsSource).toContain('surface-profile-group');
    expect(surfaceControlsSource).toContain('let surfaceControlsSignature =');
    expect(surfaceControlsSource).toContain('if (nextSignature === surfaceControlsSignature) return;');
  });

  it('keeps profile dropdowns attached to the shared floating menu shell', () => {
    expect(surfaceControlsSource).toContain("floating: {");
    expect(surfaceControlsSource).toContain("placement: 'bottom-end'");
    expect(surfaceControlsSource).toContain("strategy: 'fixed'");
    expect(surfaceControlsSource).toContain('onOpenChange: (open) => onProfileSelectOpenChange(open)');
  });
});
