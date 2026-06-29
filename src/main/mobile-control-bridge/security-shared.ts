export const SHARE_PBKDF2_ITERATIONS = 100_000;
export const SHARE_SALT_LENGTH = 16;
export const SHARE_IV_LENGTH = 12;
export const SHARE_AES_KEY_BYTES = 32;
export const SHARE_CHALLENGE_SALT = Buffer.from('calder-challenge-v1', 'utf8');

export function normalizeSharePassphrase(passphrase: string): string {
  return passphrase
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase();
}
