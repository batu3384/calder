import {
  EVIDENCE_TAIL_WINDOW,
  type EvidenceEvent,
  type EvidenceRunMeta,
} from '../../../shared/types-evidence.js';
import { OfficeRuntime } from './office-state.js';

const META_RETRY_DELAYS_MS = [0, 100, 300] as const;

async function getMetaWithRetry(sessionId: string): Promise<EvidenceRunMeta | null> {
  for (const delay of META_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delay);
      });
    }
    const meta = await window.calder?.evidence?.getMeta(sessionId);
    if (meta) return meta;
  }
  return null;
}

export async function loadEvidenceTails(options: {
  runtime: OfficeRuntime;
  isCurrent: () => boolean;
  onApplied: () => void;
  onRunsResolved?: (runIds: ReadonlyMap<string, string>) => void;
}): Promise<void> {
  if (!window.calder?.evidence || !options.isCurrent()) return;
  const runIds = new Map<string, string>();
  let applied = false;
  const apply = (sessionId: string, events: EvidenceEvent[], runId?: string): void => {
    if (!options.isCurrent()) return;
    options.runtime.applyEvidence(sessionId, events, runId);
    applied = true;
  };
  const clear = (sessionId: string): void => {
    if (!options.isCurrent()) return;
    options.runtime.clearEvidence(sessionId);
    applied = true;
  };

  await Promise.all(
    options.runtime.sessionCharacterIds().map(async (sessionId) => {
      try {
        const meta = await getMetaWithRetry(sessionId);
        if (!meta) {
          clear(sessionId);
          return;
        }
        runIds.set(sessionId, meta.runId);
        const total = meta.eventCount ?? 0;
        const offset = Math.max(0, total - EVIDENCE_TAIL_WINDOW);
        const page = await window.calder.evidence.listEvents(
          sessionId,
          offset,
          EVIDENCE_TAIL_WINDOW,
        );
        if (!page.runId || page.runId !== meta.runId) {
          const currentMeta = await getMetaWithRetry(sessionId);
          if (currentMeta?.runId) runIds.set(sessionId, currentMeta.runId);
          else runIds.delete(sessionId);
          clear(sessionId);
          return;
        }
        const latestMeta = await getMetaWithRetry(sessionId);
        if (!latestMeta || latestMeta.runId !== page.runId) {
          if (latestMeta?.runId) runIds.set(sessionId, latestMeta.runId);
          else runIds.delete(sessionId);
          clear(sessionId);
          return;
        }
        runIds.set(sessionId, page.runId);
        apply(sessionId, [...page.events], page.runId);
      } catch {
        return;
      }
    }),
  );

  if (!options.isCurrent()) return;
  if (applied) options.onApplied();
  options.onRunsResolved?.(runIds);
  if (runIds.size > 0) window.calder.evidence.subscribe([...new Set(runIds.values())]);
  else window.calder.evidence.unsubscribe();
}
