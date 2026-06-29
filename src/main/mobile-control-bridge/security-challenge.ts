import { createHmac, pbkdf2Sync } from 'node:crypto';

import {
  normalizeSharePassphrase,
  SHARE_AES_KEY_BYTES,
  SHARE_CHALLENGE_SALT,
  SHARE_PBKDF2_ITERATIONS,
} from './security-shared';

function isHexString(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

export function computeShareChallengeResponse(challengeHex: string, passphrase: string): string {
  const challenge = Buffer.from(challengeHex, 'hex');
  const hmacKey = pbkdf2Sync(
    Buffer.from(normalizeSharePassphrase(passphrase), 'utf8'),
    SHARE_CHALLENGE_SALT,
    SHARE_PBKDF2_ITERATIONS,
    SHARE_AES_KEY_BYTES,
    'sha256',
  );
  return createHmac('sha256', hmacKey).update(challenge).digest('hex');
}

export function isEncryptedChallengePayload(value: string): boolean {
  return isHexString(value);
}
