import { describe, expect, it } from 'vitest';
import { DIRECT_TRANSLATIONS, DIRECT_TRANSLATION_ENTRIES } from './i18n-translations.js';
import { TAB_AND_TERMINAL_TRANSLATION_ENTRIES } from './i18n-translations-tab-terminal.js';
import { PREFERENCES_TRANSLATION_ENTRIES } from './i18n-translations-preferences.js';
import { MOBILE_TRANSLATION_ENTRIES } from './i18n-translations-mobile.js';
import { ERROR_TRANSLATION_ENTRIES } from './i18n-translations-errors.js';

describe('i18n translations module', () => {
  it('exports direct translations as a map', () => {
    expect(DIRECT_TRANSLATIONS).toBeInstanceOf(Map);
    expect(DIRECT_TRANSLATIONS.size).toBeGreaterThan(0);
  });

  it('keeps core Turkish glossary entries available', () => {
    expect(DIRECT_TRANSLATIONS.get('Hybrid context')).toBe('Hibrit bağlam');
    expect(DIRECT_TRANSLATIONS.get('Workflows & checkpoints')).toBe('İş akışları ve kontrol noktaları');
    expect(DIRECT_TRANSLATIONS.get('Mobile Dependency Doctor')).toBe('Mobil Bağımlılık Doktoru');
  });

  it('does not contain conflicting duplicate source keys', () => {
    const seen = new Map<string, string>();
    const conflicts: Array<{ source: string; previous: string; next: string }> = [];

    for (const [source, target] of DIRECT_TRANSLATION_ENTRIES) {
      const previous = seen.get(source);
      if (previous !== undefined && previous !== target) {
        conflicts.push({ source, previous, next: target });
      }
      seen.set(source, target);
    }

    expect(conflicts).toEqual([]);
  });

  it('keeps tab and terminal namespace keys unique and wired into the direct map', () => {
    const keys = TAB_AND_TERMINAL_TRANSLATION_ENTRIES.map(([source]) => source);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DIRECT_TRANSLATIONS.get('Branch actions')).toBe('Dal eylemleri');
    expect(DIRECT_TRANSLATIONS.get('Drag to reorder')).toBe('Yeniden sıralamak için sürükle');
  });

  it('keeps preferences namespace keys unique and wired into the direct map', () => {
    const keys = PREFERENCES_TRANSLATION_ENTRIES.map(([source]) => source);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DIRECT_TRANSLATIONS.get('Provider health')).toBe('Sağlayıcı durumu');
    expect(DIRECT_TRANSLATIONS.get('Tracking & fixes')).toBe('İzleme ve düzeltmeler');
  });

  it('keeps mobile namespace keys unique and wired into the direct map', () => {
    const keys = MOBILE_TRANSLATION_ENTRIES.map(([source]) => source);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DIRECT_TRANSLATIONS.get('Mobile Dependency Doctor')).toBe('Mobil Bağımlılık Doktoru');
    expect(DIRECT_TRANSLATIONS.get('Installing…')).toBe('Kuruluyor…');
  });

  it('keeps error namespace keys unique and wired into the direct map', () => {
    const keys = ERROR_TRANSLATION_ENTRIES.map(([source]) => source);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DIRECT_TRANSLATIONS.get('Failed to load branches')).toBe('Dallar yüklenemedi');
    expect(DIRECT_TRANSLATIONS.get('Branch name is required')).toBe('Dal adı zorunludur');
    expect(DIRECT_TRANSLATIONS.get('Error')).toBe('Hata');
  });
});
