/** Normalize evidence:subscribe payload into unique non-empty runIds. */
export function normalizeEvidenceSubscribeRunIds(raw: unknown): string[] {
  const ids = Array.isArray(raw) ? raw : [raw];
  const runIds: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    runIds.push(trimmed);
  }
  return runIds;
}
