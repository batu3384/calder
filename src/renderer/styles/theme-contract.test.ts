import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
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

  it('defines shared cockpit control classes', () => {
    expect(cockpitCss).toContain('.shell-kicker');
    expect(cockpitCss).toContain('.control-chip');
    expect(cockpitCss).toContain('.surface-card');
  });
});
