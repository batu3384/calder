// Crypto utilities for P2P session sharing authentication.
// Uses Web Crypto API (available in Electron's Chromium renderer).

export class DecryptionError extends Error {
  constructor() {
    super('Invalid passphrase or corrupted code');
    this.name = 'DecryptionError';
  }
}

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const CHALLENGE_SALT = new TextEncoder().encode('calder-challenge-v1');
const LEGACY_PIN_LENGTH = 8;
const MIN_PASSPHRASE_LENGTH = 12;
const PASSPHRASE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSPHRASE_GROUPS = 4;
const PASSPHRASE_GROUP_LENGTH = 4;

function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function normalizePassphrase(passphrase: string): string {
  return passphrase.trim().replace(/[\s-]+/g, '').toUpperCase();
}

function hasAllowedPassphraseChars(passphrase: string): boolean {
  return /^[A-Za-z0-9\s-]+$/.test(passphrase.trim());
}

export function generatePassphrase(): string {
  const chars: string[] = [];
  const totalLength = PASSPHRASE_GROUPS * PASSPHRASE_GROUP_LENGTH;
  for (let i = 0; i < totalLength; i++) {
    const idx = crypto.getRandomValues(new Uint32Array(1))[0] % PASSPHRASE_ALPHABET.length;
    chars.push(PASSPHRASE_ALPHABET[idx]);
  }
  return chars.join('').match(new RegExp(`.{1,${PASSPHRASE_GROUP_LENGTH}}`, 'g'))!.join('-');
}

export function validateSharePassphrase(passphrase: string): string | null {
  if (!passphrase.trim()) return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`;
  if (!hasAllowedPassphraseChars(passphrase)) {
    return 'Passphrase may contain only letters, numbers, spaces, or hyphens';
  }

  const normalized = normalizePassphrase(passphrase);
  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`;
  }

  if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) {
    return 'Passphrase must include both letters and numbers';
  }

  return null;
}

export function validateJoinPassphrase(passphrase: string): string | null {
  const trimmed = passphrase.trim();
  if (!trimmed) {
    return `Enter the 8-digit PIN or passphrase from the host`;
  }
  if (/^\d{8}$/.test(trimmed)) {
    return null;
  }
  const shareError = validateSharePassphrase(trimmed);
  if (shareError) {
    return `Enter the 8-digit PIN or passphrase from the host. ${shareError}`;
  }
  return null;
}

async function deriveKey(passphrase: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export async function encryptPayload(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function decryptPayload(encoded: string, passphrase: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    throw new DecryptionError();
  }

  if (bytes.length < SALT_LENGTH + IV_LENGTH + 1) {
    throw new DecryptionError();
  }

  const salt = bytes.slice(0, SALT_LENGTH);
  const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = bytes.slice(SALT_LENGTH + IV_LENGTH);

  let decrypted: ArrayBuffer;
  try {
    const key = await deriveKey(passphrase, salt, ['decrypt']);
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new DecryptionError();
  }

  return new TextDecoder().decode(decrypted);
}

export function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function computeChallengeResponse(challenge: Uint8Array, passphrase: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const hmacKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(CHALLENGE_SALT), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, toBufferSource(challenge));
  return bytesToHex(new Uint8Array(sig));
}
