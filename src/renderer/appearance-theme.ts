import type { AppearanceTheme } from '../shared/types-provider.js';

export function resolveAppearanceTheme(theme: AppearanceTheme | undefined): 'light' | 'dark' {
  const preference = theme ?? 'system';
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function applyAppearanceTheme(theme: AppearanceTheme | undefined): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveAppearanceTheme(theme);
  if (resolved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    return;
  }
  document.documentElement.removeAttribute('data-theme');
}

export function bindAppearanceThemeListener(onChange: (theme: AppearanceTheme | undefined) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const handler = (): void => onChange(undefined);
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
