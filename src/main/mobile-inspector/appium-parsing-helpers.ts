export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractAppiumErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const value = root.value && typeof root.value === 'object'
    ? (root.value as Record<string, unknown>)
    : null;
  const messageCandidates = [
    value?.message,
    root.message,
    value?.error,
  ];
  for (const candidate of messageCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function extractAppiumSessionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  if (typeof root.sessionId === 'string' && root.sessionId.trim().length > 0) {
    return root.sessionId;
  }
  const value = root.value && typeof root.value === 'object'
    ? (root.value as Record<string, unknown>)
    : null;
  if (value && typeof value.sessionId === 'string' && value.sessionId.trim().length > 0) {
    return value.sessionId;
  }
  return null;
}
