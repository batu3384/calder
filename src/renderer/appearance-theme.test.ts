import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';

import {
  applyAppearanceTheme,
  bindAppearanceThemeListener,
  resolveAppearanceTheme,
} from './appearance-theme.js';

describe('appearance-theme', () => {
  it('resolveAppearanceTheme maps explicit light and dark', () => {
    expect(resolveAppearanceTheme('light')).toBe('light');
    expect(resolveAppearanceTheme('dark')).toBe('dark');
  });

  it('resolveAppearanceTheme follows system preference when unset', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    expect(resolveAppearanceTheme('system')).toBe('light');

    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    expect(resolveAppearanceTheme('system')).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('applyAppearanceTheme sets and clears data-theme attribute', () => {
    const setAttribute = vi.fn();
    const removeAttribute = vi.fn();
    vi.stubGlobal('document', {
      documentElement: { setAttribute, removeAttribute },
    });

    applyAppearanceTheme('light');
    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'light');

    applyAppearanceTheme('dark');
    expect(removeAttribute).toHaveBeenCalledWith('data-theme');

    vi.unstubAllGlobals();
  });

  it('bindAppearanceThemeListener unsubscribes cleanly', () => {
    const remove = vi.fn();
    const add = vi.fn();
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: add,
        removeEventListener: remove,
      }),
    });

    const onChange = vi.fn();
    const unsubscribe = bindAppearanceThemeListener(onChange);
    expect(add).toHaveBeenCalledOnce();
    unsubscribe();
    expect(remove).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

describe('appearance-theme source contract', () => {
  const source = readFileSync(new URL('./appearance-theme.ts', import.meta.url), 'utf-8');

  it('uses data-theme light attribute and removes it for dark', () => {
    expect(source).toContain("setAttribute('data-theme', 'light')");
    expect(source).toContain("removeAttribute('data-theme')");
  });
});
