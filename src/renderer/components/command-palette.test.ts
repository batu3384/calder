import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./command-palette.ts', import.meta.url), 'utf-8');

describe('command-palette contract', () => {
  it('restores focus when palette closes', () => {
    expect(source).toContain('previousFocus');
    expect(source).toContain('previousFocus?.focus?.()');
  });

  it('exposes listbox semantics for keyboard navigation', () => {
    expect(source).toContain("setAttribute('role', 'listbox')");
    expect(source).toContain("setAttribute('role', 'option')");
    expect(source).toContain('aria-activedescendant');
    expect(source).toContain('scrollIntoView');
  });

  it('registers lifecycle cleanup on open', () => {
    expect(source).toContain('registerLifecycle(commandPaletteLifecycle)');
    expect(source).toContain('unregisterLifecycle(commandPaletteLifecycle)');
  });
});
