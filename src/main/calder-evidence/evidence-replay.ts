import { EVIDENCE_TAIL_WINDOW, type EvidenceEvent } from '../../shared/types-evidence.js';

export const EVIDENCE_REPLAY_WINDOW = EVIDENCE_TAIL_WINDOW;

export function replayEvidenceTail(
  runId: string,
  eventCount: number,
  readEvents: (runId: string, options: { offset?: number; limit?: number }) => EvidenceEvent[],
): EvidenceEvent[] {
  const total = Number.isFinite(eventCount) ? Math.max(0, eventCount) : 0;
  return readEvents(runId, {
    offset: Math.max(0, total - EVIDENCE_REPLAY_WINDOW),
    limit: EVIDENCE_REPLAY_WINDOW,
  });
}
