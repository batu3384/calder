import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const shellSource = readFileSync(new URL('./preferences-modal-shell.ts', import.meta.url), 'utf-8');
const prefsCss = readFileSync(new URL('../../styles/preferences.css', import.meta.url), 'utf-8');

describe('preferences modal shell density contract', () => {
  it('renders icon + label without caption nodes', () => {
    expect(shellSource).not.toContain('preferences-menu-item-caption');
    expect(shellSource).toContain('preferences-menu-item-icon');
    expect(shellSource).toContain('aria-label');
  });

  it('uses inset accent indicator instead of absolute before bar', () => {
    expect(prefsCss).not.toContain('.preferences-menu-item::before');
    expect(prefsCss).toContain('inset 2px 0 0 var(--accent)');
  });
});
