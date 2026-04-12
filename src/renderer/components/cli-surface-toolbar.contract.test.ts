import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./cli-surface/pane.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/cli-surface.css', import.meta.url), 'utf-8');

describe('cli surface toolbar contract', () => {
  it('groups runtime and capture controls into distinct toolbar sections', () => {
    expect(source).toContain('cli-surface-action-group');
    expect(source).toContain('cli-surface-action-label');
    expect(source).toContain("runtimeLabel.textContent = 'Runtime'");
    expect(source).toContain("captureLabel.textContent = 'Capture'");
    expect(source).toContain('cli-surface-route');
    expect(source).toContain('cli-surface-adapter-meta');
  });

  it('styles grouped toolbar controls instead of one flat action row', () => {
    expect(css).toContain('.cli-surface-toolbar-main');
    expect(css).toContain('.cli-surface-toolbar-meta');
    expect(css).toContain('.cli-surface-action-group');
    expect(css).toContain('.cli-surface-action-label');
    expect(css).toContain('.cli-surface-route');
  });
});
