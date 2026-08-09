import type { EvidenceEvent, EvidenceRunMeta } from '../../../shared/types-evidence.js';
import { OfficeRuntime } from './office-state.js';

const EVIDENCE_WINDOW = 120;
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
}): Promise<void> {
  if (!window.calder?.evidence || !options.isCurrent()) return;
  const runIds: string[] = [];
  let applied = false;
  const apply = (sessionId: string, events: EvidenceEvent[]): void => {
    if (!options.isCurrent()) return;
    options.runtime.applyEvidence(sessionId, events);
    applied = true;
  };

  await Promise.all(
    options.runtime.sessionCharacterIds().map(async (sessionId) => {
      try {
        const meta = await getMetaWithRetry(sessionId);
        if (!meta) {
          apply(sessionId, []);
          return;
        }
        if (meta.runId) runIds.push(meta.runId);
        const total = meta.eventCount ?? 0;
        const offset = Math.max(0, total - EVIDENCE_WINDOW);
        const page = await window.calder.evidence.listEvents(sessionId, offset, EVIDENCE_WINDOW);
        apply(sessionId, [...page.events]);
      } catch {
        apply(sessionId, []);
      }
    }),
  );

  if (!options.isCurrent()) return;
  if (applied) options.onApplied();
  if (runIds.length > 0) window.calder.evidence.subscribe([...new Set(runIds)]);
  else window.calder.evidence.unsubscribe();
}
