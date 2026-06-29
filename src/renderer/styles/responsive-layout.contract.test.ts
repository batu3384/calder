import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const responsiveCss = readFileSync(new URL('./responsive-layout.css', import.meta.url), 'utf-8');
const stylesEntry = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');

describe('responsive layout contract', () => {
  it('is imported after theme overrides', () => {
    expect(stylesEntry).toContain("@import url('./styles/responsive-layout.css');");
    expect(stylesEntry.indexOf('responsive-layout.css')).toBeGreaterThan(
      stylesEntry.indexOf('theme-command-studio.css'),
    );
  });

  it('clamps modal width and wraps long preference copy', () => {
    expect(responsiveCss).toContain('width: min(960px, calc(100vw - 24px))');
    expect(responsiveCss).toContain('overflow-wrap: anywhere');
    expect(responsiveCss).toContain('.about-update-row');
    expect(responsiveCss).toContain('#cli-update-panel');
  });
});
