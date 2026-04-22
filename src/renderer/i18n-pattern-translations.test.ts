import { describe, expect, it } from 'vitest';
import { createPatternTranslations } from './i18n-pattern-translations.js';

function getEntry(
  patterns: ReturnType<typeof createPatternTranslations>,
  source: string,
) {
  return patterns.find((entry) => entry.pattern.source === source);
}

function applyPattern(
  patterns: ReturnType<typeof createPatternTranslations>,
  source: string,
  input: string,
) {
  const entry = getEntry(patterns, source);
  expect(entry).toBeDefined();
  const match = input.match(entry!.pattern);
  expect(match).toBeTruthy();
  return entry!.replace(match!);
}

describe('i18n pattern translations', () => {
  it('creates expected dynamic regex entries', () => {
    const patterns = createPatternTranslations((value) => value);
    expect(getEntry(patterns, '^Session (\\d+)$')).toBeDefined();
    expect(getEntry(patterns, '^Authentication failed:\\s*(.+)$')).toBeDefined();
  });

  it('applies static numeric translation patterns', () => {
    const patterns = createPatternTranslations((value) => value);
    const entry = getEntry(patterns, '^Session (\\d+)$');
    const match = 'Session 12'.match(entry!.pattern);
    expect(match).toBeTruthy();
    expect(entry!.replace(match!)).toBe('Oturum 12');
  });

  it('uses translation callback for mixed dynamic messages', () => {
    const patterns = createPatternTranslations((value) => `TR:${value}`);
    const entry = getEntry(patterns, '^Started:\\s*(.+)$');
    const match = 'Started: ready'.match(entry!.pattern);
    expect(match).toBeTruthy();
    expect(entry!.replace(match!)).toBe('Başlangıç: TR:ready');
  });

  it('uses translation callback for failure and routing patterns', () => {
    const patterns = createPatternTranslations((value) => `TR:${value}`);
    expect(applyPattern(patterns, '^Update failed:\\s*(.+)$', 'Update failed: stalled')).toBe('Güncelleme başarısız: TR:stalled');
    expect(applyPattern(patterns, '^Routing to\\s+(.+)$', 'Routing to live')).toBe('TR:live oturumuna yönlendiriliyor');
  });

  it('translates conditional and inspector status patterns', () => {
    const patterns = createPatternTranslations((value) => value);
    expect(applyPattern(patterns, '^Auto-scroll:\\s*(ON|OFF)$', 'Auto-scroll: ON')).toBe('Otomatik kaydırma: AÇIK');
    expect(applyPattern(patterns, '^Auto-scroll:\\s*(ON|OFF)$', 'Auto-scroll: OFF')).toBe('Otomatik kaydırma: KAPALI');
    expect(
      applyPattern(
        patterns,
        '^Launching (iOS Simulator|Android Emulator)…$',
        'Launching Android Emulator…',
      ),
    ).toBe('Android Emülatör başlatılıyor…');
  });

  it('keeps specific status-session pattern ahead of generic status pattern', () => {
    const patterns = createPatternTranslations((value) => `TR:${value}`);
    const specificIndex = patterns.findIndex(
      (entry) => entry.pattern.source === '^Status:\\s*(\\S+)\\s+Session:\\s*(.+)\\s+Drag to reorder$',
    );
    const genericIndex = patterns.findIndex(
      (entry) => entry.pattern.source === '^Status:\\s*(.+)$',
    );
    expect(specificIndex).toBeGreaterThanOrEqual(0);
    expect(genericIndex).toBeGreaterThanOrEqual(0);
    expect(specificIndex).toBeLessThan(genericIndex);
  });

  it('keeps regex pattern sources unique to avoid shadowed duplicates', () => {
    const patterns = createPatternTranslations((value) => value);
    const ids = patterns.map((entry) => `${entry.pattern.flags}:${entry.pattern.source}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
