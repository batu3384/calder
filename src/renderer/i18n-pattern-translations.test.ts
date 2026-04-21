import { describe, expect, it } from 'vitest';
import { createPatternTranslations } from './i18n-pattern-translations.js';

function getEntry(
  patterns: ReturnType<typeof createPatternTranslations>,
  source: string,
) {
  return patterns.find((entry) => entry.pattern.source === source);
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

  it('keeps regex pattern sources unique to avoid shadowed duplicates', () => {
    const patterns = createPatternTranslations((value) => value);
    const ids = patterns.map((entry) => `${entry.pattern.flags}:${entry.pattern.source}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
