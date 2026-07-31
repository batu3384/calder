import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const pixelPanelSource = readFileSync(
  new URL('../context-pixel-panel.ts', import.meta.url),
  'utf-8',
);
const inspectorShimSource = readFileSync(
  new URL('./session-inspector.ts', import.meta.url),
  'utf-8',
);
const contextInspectorSource = readFileSync(
  new URL('../context-inspector.ts', import.meta.url),
  'utf-8',
);
const ecosystemViewsSource = readFileSync(
  new URL('./ecosystem-views.ts', import.meta.url),
  'utf-8',
);

describe('pixel rail merge contract', () => {
  it('mounts Pixel Ecosystem + Studio in Context Inspector without SI dock', () => {
    expect(pixelPanelSource).toContain('mountContextPixel');
    expect(pixelPanelSource).toContain('renderPixelStudio');
    expect(pixelPanelSource).toContain('buildEcosystemCardElement');
    expect(pixelPanelSource).toContain('focusCliSession');
    expect(pixelPanelSource).not.toContain('focusInspectorSession');
    expect(pixelPanelSource).not.toContain('setInspectorTab');
    expect(contextInspectorSource).toContain('mountContextPixel');
    expect(contextInspectorSource).toContain('focusContextPixelTab');
    expect(inspectorShimSource).toContain('focusContextPixelTab');
    expect(inspectorShimSource).not.toContain('createPanel');
    expect(inspectorShimSource).not.toContain('#session-inspector');
    expect(ecosystemViewsSource).toContain('mountContextPixel as renderEcosystem');
  });
});
