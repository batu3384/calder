import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const auroraCss = readFileSync(new URL('./theme-aurora.css', import.meta.url), 'utf-8');
const cockpitUrl = new URL('./cockpit.css', import.meta.url);
const cockpitCss = existsSync(cockpitUrl) ? readFileSync(cockpitUrl, 'utf-8') : '';

describe('precision cockpit theme contract', () => {
  it('defines the shared cockpit design tokens', () => {
    expect(baseCss).toContain('--surface-canvas');
    expect(baseCss).toContain('--surface-panel');
    expect(baseCss).toContain('--surface-elevated');
    expect(baseCss).toContain('--surface-live');
    expect(baseCss).toContain('--surface-deck');
    expect(baseCss).toContain('--surface-ops');
    expect(baseCss).toContain('--control-height-md');
    expect(baseCss).toContain('--accent-soft');
    expect(baseCss).toContain('--accent-warm');
    expect(baseCss).toContain('--surface-shell');
    expect(baseCss).toContain('--border-hairline');
    expect(baseCss).toContain('--accent-line');
    expect(baseCss).toContain('--motion-fast');
    expect(baseCss).toContain('--motion-panel');
    expect(baseCss).not.toContain('--accent: #ef6879;');
  });

  it('loads the aurora premium theme after feature styles', () => {
    expect(imports.trim().endsWith("@import url('./styles/theme-aurora.css');")).toBe(true);
    expect(baseCss).toContain('--accent-aurora');
    expect(baseCss).not.toContain('--surface-canvas: #090705;');
    expect(auroraCss).toContain('--aurora-panel-gradient');
    expect(auroraCss).toContain('calder-aurora-drift');
  });

  it('keeps terminal provider badges out of the generic aurora label tint', () => {
    expect(auroraCss).not.toContain('.terminal-pane-provider,');
  });

  it('defines shared cockpit control classes', () => {
    expect(cockpitCss).toContain('.shell-kicker');
    expect(cockpitCss).toContain('.control-chip');
    expect(cockpitCss).toContain('.surface-card');
  });
});
