import { describe, it, expect } from 'vitest';
import {
  validateSharePassphrase,
  validateJoinPassphrase,
  normalizePassphrase,
  generatePassphrase,
  encryptPayload,
  decryptPayload,
  DecryptionError,
  generateChallenge,
  computeChallengeResponse,
  bytesToHex,
  hexToBytes,
} from './share-crypto.js';

describe('passphrase validation', () => {
  it('accepts strong share passphrases', () => {
    expect(validateSharePassphrase('calder secure 2026')).toBeNull();
  });

  it('rejects short share passphrases', () => {
    expect(validateSharePassphrase('short123')).toMatch(/at least 12/i);
  });

  it('rejects share passphrases with punctuation', () => {
    expect(validateSharePassphrase('bad!phrase!!')).toMatch(/letters, numbers/i);
  });

  it('accepts legacy 8-digit join PINs for backwards compatibility', () => {
    expect(validateJoinPassphrase('12345678')).toBeNull();
  });

  it('accepts strong join passphrases', () => {
    expect(validateJoinPassphrase('calder secure 2026')).toBeNull();
  });

  it('rejects short join secrets that are not legacy PINs', () => {
    expect(validateJoinPassphrase('1234567')).toMatch(/8-digit PIN or passphrase/i);
  });

  it('normalizes case, spaces, and hyphens before crypto use', () => {
    expect(normalizePassphrase('Abcd- ef12 Gh34')).toBe('ABCDEF12GH34');
  });

  it('generates grouped high-entropy passphrases', () => {
    expect(generatePassphrase()).toMatch(/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  });
});

describe('encryptPayload / decryptPayload', () => {
  it('round-trips correctly', async () => {
    const plaintext = '{"type":"offer","sdp":"v=0\\r\\n..."}';
    const passphrase = 'Abcd-ef12-gh34-jk56';
    const encrypted = await encryptPayload(plaintext, passphrase);
    const decrypted = await decryptPayload(encrypted, passphrase.toLowerCase());
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random salt/IV)', async () => {
    const plaintext = 'hello world';
    const passphrase = 'ABCD-EF12-GH34-JK56';
    const a = await encryptPayload(plaintext, passphrase);
    const b = await encryptPayload(plaintext, passphrase);
    expect(a).not.toBe(b);
  });

  it('throws DecryptionError on wrong passphrase', async () => {
    const encrypted = await encryptPayload('secret data', 'ABCD-EF12-GH34-JK56');
    await expect(decryptPayload(encrypted, 'WXYZ-UV98-TS76-RQ54')).rejects.toThrow(DecryptionError);
  });

  it('throws DecryptionError on corrupted ciphertext', async () => {
    await expect(decryptPayload('not-valid-base64!!!', 'ABCD-EF12-GH34-JK56')).rejects.toThrow(DecryptionError);
  });

  it('throws DecryptionError on truncated data', async () => {
    const short = btoa('abc');
    await expect(decryptPayload(short, 'ABCD-EF12-GH34-JK56')).rejects.toThrow(DecryptionError);
  });
});

describe('generateChallenge', () => {
  it('returns 32 bytes', () => {
    const challenge = generateChallenge();
    expect(challenge).toBeInstanceOf(Uint8Array);
    expect(challenge.length).toBe(32);
  });
});

describe('bytesToHex / hexToBytes', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe('00017f80ff');
    expect(hexToBytes(hex)).toEqual(bytes);
  });
});

describe('computeChallengeResponse', () => {
  it('is deterministic for the same inputs', async () => {
    const challenge = new Uint8Array(32);
    challenge.fill(42);
    const passphrase = 'ABCD-EF12-GH34-JK56';
    const a = await computeChallengeResponse(challenge, passphrase);
    const b = await computeChallengeResponse(challenge, 'abcd ef12 gh34 jk56');
    expect(a).toBe(b);
  });

  it('produces different output for different passphrases', async () => {
    const challenge = new Uint8Array(32);
    challenge.fill(7);
    const a = await computeChallengeResponse(challenge, 'ABCD-EF12-GH34-JK56');
    const b = await computeChallengeResponse(challenge, 'WXYZ-UV98-TS76-RQ54');
    expect(a).not.toBe(b);
  });

  it('produces different output for different challenges', async () => {
    const passphrase = 'ABCD-EF12-GH34-JK56';
    const c1 = new Uint8Array(32);
    c1.fill(1);
    const c2 = new Uint8Array(32);
    c2.fill(2);
    const a = await computeChallengeResponse(c1, passphrase);
    const b = await computeChallengeResponse(c2, passphrase);
    expect(a).not.toBe(b);
  });

  it('returns a 64-character hex string (SHA-256 = 32 bytes)', async () => {
    const challenge = generateChallenge();
    const response = await computeChallengeResponse(challenge, 'ABCD-EF12-GH34-JK56');
    expect(response).toMatch(/^[0-9a-f]{64}$/);
  });
});
