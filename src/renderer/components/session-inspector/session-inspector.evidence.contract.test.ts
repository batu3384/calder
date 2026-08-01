import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const pixelOfficeSource = readFileSync(
  new URL('../pixel-office/mount-pixel-office.ts', import.meta.url),
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
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');

describe('pixel office shell contract', () => {
  it('hosts Pixel Office inside the inspector rail and drops Denetçi Pixel tab', () => {
    expect(html).toContain('id="pixel-office"');
    expect(html).toContain('class="pixel-office-rail"');
    expect(html).toContain('id="pixel-office-canvas-host"');
    expect(html).toContain('id="context-inspector"');
    expect(html).toContain('id="pixel-office-rail-resize"');
    expect(html).not.toContain('btn-close-pixel-office');
    expect(html).not.toContain('context-inspector-tab-pixel');
    expect(html).not.toContain('id="context-pixel-host"');
    expect(pixelOfficeSource).toContain('ensureInspectorOpen');
    expect(pixelOfficeSource).toContain('togglePixelOffice');
    expect(pixelOfficeSource).toContain('initPixelOffice');
    expect(inspectorShimSource).toContain('togglePixelOffice');
    expect(inspectorShimSource).toContain('openPixelOffice');
    expect(contextInspectorSource).not.toContain('mountContextPixel');
    expect(contextInspectorSource).not.toContain("'pixel'");
  });
});
