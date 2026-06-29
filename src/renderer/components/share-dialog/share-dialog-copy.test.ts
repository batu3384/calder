import { describe, expect, it } from 'vitest';

import {
  getShareDialogCopy,
  localizePassphraseError,
  resolveShareDialogLanguage,
} from './share-dialog-copy.js';

describe('share-dialog copy helpers', () => {
  it('normalizes supported UI language values', () => {
    expect(resolveShareDialogLanguage('tr')).toBe('tr');
    expect(resolveShareDialogLanguage('en')).toBe('en');
    expect(resolveShareDialogLanguage(undefined)).toBe('en');
  });

  it('returns localized copy payloads for english and turkish', () => {
    const en = getShareDialogCopy('en');
    const tr = getShareDialogCopy('tr');

    expect(en.heroTitle).toBe('Share Session');
    expect(tr.heroTitle).toBe('Oturum Paylaş');
    expect(en.mobileConnectionSummary('Connected')).toContain('Connected');
    expect(tr.mobileConnectionSummary('Aktif bağlantı var')).toContain('Aktif bağlantı var');
  });

  it('localizes known passphrase validation errors for turkish', () => {
    expect(localizePassphraseError('Passphrase must be at least 16 characters', 'tr')).toBe(
      'Parola en az 16 karakter olmalıdır',
    );
    expect(
      localizePassphraseError('Passphrase may contain only letters, numbers, spaces, or hyphens', 'tr'),
    ).toBe('Parola yalnızca harf, sayı, boşluk veya tire içerebilir');
    expect(localizePassphraseError('Passphrase must include both letters and numbers', 'tr')).toBe(
      'Parola hem harf hem sayı içermelidir',
    );
    expect(localizePassphraseError('some other error', 'tr')).toBe('some other error');
  });

  it('keeps english errors unchanged', () => {
    const message = 'Passphrase must include both letters and numbers';
    expect(localizePassphraseError(message, 'en')).toBe(message);
  });
});
