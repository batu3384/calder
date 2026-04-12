import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const cockpitCss = readFileSync(new URL('./cockpit.css', import.meta.url), 'utf-8');

describe('cockpit shared controls contract', () => {
  it('styles shared chips as compact instrument indicators instead of soft pills', () => {
    expect(cockpitCss).toContain('.control-chip');
    expect(cockpitCss).toContain('border-radius: 10px;');
    expect(cockpitCss).toContain('min-height: 22px;');
    expect(cockpitCss).toContain('background: color-mix(in srgb, var(--surface-raised) 58%, transparent);');
  });
});
