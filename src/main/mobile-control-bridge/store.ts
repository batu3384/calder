import type { MobileControlAnswerResult, PairingRecord } from './model';

const pairings = new Map<string, PairingRecord>();

export function isExpired(record: PairingRecord): boolean {
  return Date.now() > record.expiresAtMs;
}

export function setPairingRecord(record: PairingRecord): void {
  pairings.set(record.id, record);
}

export function deletePairingRecord(pairingId: string): void {
  pairings.delete(pairingId);
}

export function clearPairingStore(): void {
  pairings.clear();
}

export function getPairingFromPath(
  pathname: string,
  suffix: '/bootstrap' | '/answer' | '/challenge',
): PairingRecord | null {
  const match = pathname.match(new RegExp(`^/api/pair/([a-f0-9]{24})${suffix}$`));
  if (!match) return null;
  return pairings.get(match[1]) ?? null;
}

export function getPagePairing(pathname: string): PairingRecord | null {
  const match = pathname.match(/^\/m\/([a-f0-9]{24})$/);
  if (!match) return null;
  return pairings.get(match[1]) ?? null;
}

export function cleanupExpiredPairings(onExpire: (pairingId: string) => void): void {
  for (const [pairingId, record] of pairings) {
    if (isExpired(record)) {
      pairings.delete(pairingId);
      onExpire(pairingId);
    }
  }
}

export function consumePairingAnswer(
  pairingId: string,
  onExpire: (pairingId: string) => void,
): MobileControlAnswerResult {
  const record = pairings.get(pairingId);
  if (!record) return { answer: null, status: 'expired' };
  if (isExpired(record)) {
    pairings.delete(pairingId);
    onExpire(pairingId);
    return { answer: null, status: 'expired' };
  }
  if (!record.answer) return { answer: null, status: 'pending' };
  if (record.answerConsumed) return { answer: null, status: 'expired' };
  record.answerConsumed = true;
  return { answer: record.answer, status: 'ready' };
}
