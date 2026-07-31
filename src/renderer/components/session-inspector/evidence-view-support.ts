import type { EvidenceEvent } from '../../../shared/types-evidence.js';

export type EvidenceFilterCategory = 'all' | 'tools' | 'policy' | 'git' | 'lifecycle';

export const EVIDENCE_DOM_ROW_CAP = 250;

const TOOL_TYPES = new Set<EvidenceEvent['type']>([
  'tool_requested',
  'tool_started',
  'tool_completed',
  'tool_failed',
]);
const POLICY_TYPES = new Set<EvidenceEvent['type']>([
  'permission_requested',
  'permission_approved',
  'permission_denied',
  'operation_blocked',
  'policy_decision',
]);
const LIFECYCLE_TYPES = new Set<EvidenceEvent['type']>([
  'evidence_run_started',
  'pty_started',
  'pty_exited',
  'provider_session_started',
  'provider_session_completed',
  'provider_session_failed',
  'session_started',
  'session_resumed',
  'session_interrupted',
  'session_completed',
  'session_failed',
  'session_ended',
  'summary_rebuilt',
  'export_created',
]);

let activeEvidenceDispose: (() => void) | null = null;
let evidenceViewGeneration = 0;

export function disposeEvidenceSubscriptions(): void {
  activeEvidenceDispose?.();
  activeEvidenceDispose = null;
}

export function registerEvidenceSubscription(dispose: () => void): void {
  disposeEvidenceSubscriptions();
  activeEvidenceDispose = dispose;
}

/** Bump generation when starting an async evidence/studio/changes render. */
export function beginEvidenceViewGeneration(): number {
  evidenceViewGeneration += 1;
  return evidenceViewGeneration;
}

export function isEvidenceViewGenerationCurrent(generation: number): boolean {
  return generation === evidenceViewGeneration;
}

export function mergeEvidenceEvents(
  existing: EvidenceEvent[],
  incoming: EvidenceEvent[],
): { events: EvidenceEvent[]; added: number } {
  if (incoming.length === 0) return { events: existing, added: 0 };
  const seen = new Set(existing.map((event) => event.eventId));
  const fresh = incoming.filter((event) => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
  if (fresh.length === 0) return { events: existing, added: 0 };
  return { events: [...existing, ...fresh], added: fresh.length };
}

export function isGitChangeEvent(event: EvidenceEvent): boolean {
  return event.type === 'git_change_observed' || event.type === 'file_change_reported';
}

export function matchesGitChangeQuery(event: EvidenceEvent, query: string): boolean {
  if (!isGitChangeEvent(event)) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    event.type,
    ...(event.sanitizedPaths ?? []),
    typeof event.sanitizedMeta?.category === 'string' ? event.sanitizedMeta.category : '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function changesFilterStorageKey(sessionId: string): string {
  return `calder.evidence.changesFilter.${sessionId}`;
}

export function readStoredChangesQuery(sessionId: string): string {
  try {
    return sessionStorage.getItem(changesFilterStorageKey(sessionId)) ?? '';
  } catch {
    return '';
  }
}

export function writeStoredChangesQuery(sessionId: string, query: string): void {
  try {
    sessionStorage.setItem(changesFilterStorageKey(sessionId), query);
  } catch {
    // ponytail: quota/private mode — search still works for this view session
  }
}

export function matchesEvidenceFilter(
  event: EvidenceEvent,
  category: EvidenceFilterCategory,
  query: string,
): boolean {
  if (category === 'tools' && !TOOL_TYPES.has(event.type)) return false;
  if (category === 'policy' && !POLICY_TYPES.has(event.type)) return false;
  if (category === 'git' && !isGitChangeEvent(event) && event.type !== 'git_state_captured') {
    return false;
  }
  if (category === 'lifecycle' && !LIFECYCLE_TYPES.has(event.type)) return false;

  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    event.type,
    event.toolName,
    event.outcome,
    event.source,
    event.confidence,
    ...(event.sanitizedPaths ?? []),
    JSON.stringify(event.sanitizedMeta ?? {}),
    JSON.stringify(event.policyDecision ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export function evidenceFilterStorageKey(sessionId: string): string {
  return `calder.evidence.filter.${sessionId}`;
}

export function readStoredEvidenceFilter(
  sessionId: string,
): { category: EvidenceFilterCategory; query: string } | null {
  try {
    const raw = sessionStorage.getItem(evidenceFilterStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { category?: string; query?: string };
    const category = parsed.category;
    if (
      category !== 'all' &&
      category !== 'tools' &&
      category !== 'policy' &&
      category !== 'git' &&
      category !== 'lifecycle'
    ) {
      return null;
    }
    return { category, query: typeof parsed.query === 'string' ? parsed.query : '' };
  } catch {
    return null;
  }
}

export function writeStoredEvidenceFilter(
  sessionId: string,
  category: EvidenceFilterCategory,
  query: string,
): void {
  try {
    sessionStorage.setItem(
      evidenceFilterStorageKey(sessionId),
      JSON.stringify({ category, query }),
    );
  } catch {
    // ponytail: quota/private mode — filter still works for this view session
  }
}

export function sliceEventsForDom(events: EvidenceEvent[]): {
  events: EvidenceEvent[];
  truncated: boolean;
  hiddenCount: number;
} {
  if (events.length <= EVIDENCE_DOM_ROW_CAP) {
    return { events, truncated: false, hiddenCount: 0 };
  }
  const hiddenCount = events.length - EVIDENCE_DOM_ROW_CAP;
  return {
    events: events.slice(-EVIDENCE_DOM_ROW_CAP),
    truncated: true,
    hiddenCount,
  };
}
