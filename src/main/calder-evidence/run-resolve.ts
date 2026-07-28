import { getActiveRunId } from './coordinator.js';
import { assertSafeRunId } from './paths.js';
import { listRunIds, readMeta } from './store.js';

export function findRunIdByCalderSessionId(
  calderSessionId: string,
  dataRootOverride?: string,
): string | null {
  const active = getActiveRunId(calderSessionId);
  if (active) return active;

  let latest: { runId: string; createdAt: string } | null = null;
  for (const runId of listRunIds(dataRootOverride)) {
    const meta = readMeta(runId, dataRootOverride);
    if (!meta || meta.calderSessionId !== calderSessionId) continue;
    if (!latest || meta.createdAt > latest.createdAt) {
      latest = { runId, createdAt: meta.createdAt };
    }
  }
  return latest?.runId ?? null;
}

export function resolveEvidenceRunId(id: string, dataRootOverride?: string): string | null {
  try {
    assertSafeRunId(id);
    if (readMeta(id, dataRootOverride)) return id;
  } catch {
    // not a run id shape
  }
  return findRunIdByCalderSessionId(id, dataRootOverride);
}
