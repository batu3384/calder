import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

import type { ShareConnectionDescription } from '../../shared/types/project-core';
import {
  normalizeSharePassphrase,
  SHARE_AES_KEY_BYTES,
  SHARE_IV_LENGTH,
  SHARE_PBKDF2_ITERATIONS,
  SHARE_SALT_LENGTH,
} from './security-shared';

export function normalizeShareConnectionDescription(
  value: unknown,
  expectedType: 'offer' | 'answer',
): ShareConnectionDescription | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { type?: unknown; sdp?: unknown };
  if (candidate.type !== expectedType) return null;
  if (typeof candidate.sdp !== 'string' || candidate.sdp.trim().length === 0) return null;
  return {
    type: expectedType,
    sdp: candidate.sdp,
  };
}

function deriveShareKey(passphrase: string, salt: Uint8Array): Buffer {
  return pbkdf2Sync(
    Buffer.from(normalizeSharePassphrase(passphrase), 'utf8'),
    salt,
    SHARE_PBKDF2_ITERATIONS,
    SHARE_AES_KEY_BYTES,
    'sha256',
  );
}

export function encodeShareConnectionDescription(
  description: ShareConnectionDescription,
  passphrase: string,
): string {
  const salt = randomBytes(SHARE_SALT_LENGTH);
  const iv = randomBytes(SHARE_IV_LENGTH);
  const key = deriveShareKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(description), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const packed = Buffer.concat([salt, iv, ciphertext]);
  return packed.toString('base64');
}

export function decodeShareConnectionCode(
  encoded: string,
  passphrase: string,
  expectedType: 'offer' | 'answer',
): ShareConnectionDescription {
  let packed: Buffer;
  try {
    packed = Buffer.from(encoded, 'base64');
  } catch {
    throw new Error('invalid_base64');
  }
  if (packed.length <= SHARE_SALT_LENGTH + SHARE_IV_LENGTH + 16) {
    throw new Error('payload_too_short');
  }
  const salt = packed.subarray(0, SHARE_SALT_LENGTH);
  const iv = packed.subarray(SHARE_SALT_LENGTH, SHARE_SALT_LENGTH + SHARE_IV_LENGTH);
  const encrypted = packed.subarray(SHARE_SALT_LENGTH + SHARE_IV_LENGTH);
  if (encrypted.length <= 16) {
    throw new Error('ciphertext_too_short');
  }
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const authTag = encrypted.subarray(encrypted.length - 16);
  const key = deriveShareKey(passphrase, salt);

  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('decrypt_failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new Error('json_failed');
  }

  const description = normalizeShareConnectionDescription(parsed, expectedType);
  if (!description) {
    throw new Error('invalid_description');
  }
  return description;
}
