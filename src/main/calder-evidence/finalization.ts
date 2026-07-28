import { randomUUID } from 'node:crypto';

import type {
  EvidenceCompletionState,
  EvidenceEvent,
  EvidenceRunMeta,
} from '../../shared/types-evidence.js';
import {
  CLOSING_GRACE_MS,
  EVIDENCE_SCHEMA_VERSION,
  LATE_EVENT_WINDOW_MS,
} from '../../shared/types-evidence.js';
import { captureGitFingerprintBaseline, compareGitFingerprints } from './git-evidence.js';
import { evaluateEvidenceHealth } from './health.js';
import { appendEvent, readEvents, readMeta, writeMeta, writeSummary } from './store.js';
import { buildEvidenceSummary } from './summary.js';

type TimerHandle = ReturnType<typeof setTimeout>;

interface RunFinalizationState {
  graceTimer?: TimerHandle;
  sealTimer?: TimerHandle;
  gitBaseline?: Awaited<ReturnType<typeof captureGitFingerprintBaseline>>;
  gitFinal?: Awaited<ReturnType<typeof captureGitFingerprintBaseline>>;
  gitComparison?: ReturnType<typeof compareGitFingerprints>;
}

const finalizationByRun = new Map<string, RunFinalizationState>();

function getFinalizationState(runId: string): RunFinalizationState {
  let state = finalizationByRun.get(runId);
  if (!state) {
    state = {};
    finalizationByRun.set(runId, state);
  }
  return state;
}

export interface IngestEventResult {
  accepted: boolean;
  orphan: boolean;
  reason?: string;
}

export function setGitBaseline(
  runId: string,
  baseline: Awaited<ReturnType<typeof captureGitFingerprintBaseline>>,
): void {
  const state = getFinalizationState(runId);
  state.gitBaseline = baseline;
}

export function beginClosing(
  runId: string,
  options: {
    dataRootOverride?: string;
    completionState?: EvidenceCompletionState;
    onFinalized?: (meta: EvidenceRunMeta) => void;
    onSealed?: (meta: EvidenceRunMeta) => void;
  } = {},
): EvidenceRunMeta | null {
  const meta = readMeta(runId, options.dataRootOverride);
  if (!meta || meta.state === 'sealed') return meta;

  if (meta.state === 'open') {
    const closingStartedAt = Date.now();
    const updated = writeMeta(
      runId,
      {
        ...meta,
        state: 'closing',
        closingStartedAt,
        completionState: options.completionState ?? meta.completionState,
      },
      options.dataRootOverride,
    );

    const state = getFinalizationState(runId);
    if (state.graceTimer) clearTimeout(state.graceTimer);
    state.graceTimer = setTimeout(() => {
      void finalizeRun(runId, options);
    }, CLOSING_GRACE_MS);

    return updated;
  }

  return meta;
}

async function finalizeRun(
  runId: string,
  options: {
    dataRootOverride?: string;
    completionState?: EvidenceCompletionState;
    onFinalized?: (meta: EvidenceRunMeta) => void;
    onSealed?: (meta: EvidenceRunMeta) => void;
  },
): Promise<void> {
  const meta = readMeta(runId, options.dataRootOverride);
  if (!meta || meta.state === 'sealed' || meta.state === 'finalized') return;

  const state = getFinalizationState(runId);
  const projectPath = meta.projectPath;

  if (!state.gitFinal && projectPath) {
    state.gitFinal = await captureGitFingerprintBaseline(projectPath);
    if (!state.gitBaseline) {
      state.gitBaseline = state.gitFinal;
    }
    if (state.gitBaseline && state.gitFinal) {
      state.gitComparison = compareGitFingerprints(state.gitBaseline, state.gitFinal);
    }
  }

  const events = readEvents(runId, {}, options.dataRootOverride);
  const completionState = options.completionState ?? meta.completionState;
  const health = evaluateEvidenceHealth({
    meta: {
      ...meta,
      gitFinalCapturedAt: new Date().toISOString(),
    },
    events,
    providerId: meta.providerId,
  });

  const summary = buildEvidenceSummary({
    meta,
    events,
    gitObservations: state.gitComparison ?? null,
    completionState,
    health,
  });

  writeSummary(runId, summary, options.dataRootOverride);

  const lateEventAcceptUntil = Date.now() + LATE_EVENT_WINDOW_MS;
  const finalized = writeMeta(
    runId,
    {
      ...meta,
      state: 'finalized',
      completionState,
      completedAt: new Date().toISOString(),
      gitBaselineCapturedAt: meta.gitBaselineCapturedAt ?? state.gitBaseline?.capturedAt,
      gitFinalCapturedAt: state.gitFinal?.capturedAt ?? new Date().toISOString(),
      lateEventAcceptUntil,
      summaryRevision: summary.revision,
    },
    options.dataRootOverride,
  );

  options.onFinalized?.(finalized);

  if (state.sealTimer) clearTimeout(state.sealTimer);
  state.sealTimer = setTimeout(() => {
    sealRun(runId, options);
  }, LATE_EVENT_WINDOW_MS);
}

function sealRun(
  runId: string,
  options: {
    dataRootOverride?: string;
    onSealed?: (meta: EvidenceRunMeta) => void;
  },
): void {
  const meta = readMeta(runId, options.dataRootOverride);
  if (!meta || meta.state === 'sealed') return;
  const sealed = writeMeta(
    runId,
    {
      ...meta,
      state: 'sealed',
    },
    options.dataRootOverride,
  );
  options.onSealed?.(sealed);
  finalizationByRun.delete(runId);
}

export async function ingestEvent(
  runId: string,
  event: EvidenceEvent,
  dataRootOverride?: string,
): Promise<IngestEventResult> {
  const meta = readMeta(runId, dataRootOverride);
  if (!meta) {
    return { accepted: false, orphan: true, reason: 'missing_run' };
  }

  if (meta.state === 'sealed') {
    return { accepted: false, orphan: true, reason: 'sealed' };
  }

  if (meta.state === 'finalized') {
    const acceptUntil = meta.lateEventAcceptUntil ?? 0;
    if (Date.now() > acceptUntil) {
      return { accepted: false, orphan: true, reason: 'late_window_closed' };
    }
  }

  await appendEvent(runId, event, dataRootOverride);
  return { accepted: true, orphan: false };
}

export async function rebuildSummary(
  runId: string,
  dataRootOverride?: string,
): Promise<EvidenceRunMeta | null> {
  const meta = readMeta(runId, dataRootOverride);
  if (!meta) return null;

  const events = readEvents(runId, {}, dataRootOverride);
  const state = getFinalizationState(runId);
  const completionState = meta.completionState;
  const health = evaluateEvidenceHealth({
    meta,
    events,
    providerId: meta.providerId,
  });

  const nextRevision = meta.summaryRevision + 1;
  const summary = buildEvidenceSummary({
    meta: { ...meta, summaryRevision: nextRevision },
    events,
    gitObservations: state.gitComparison ?? null,
    completionState,
    health,
  });
  writeSummary(runId, summary, dataRootOverride);

  const rebuildEvent: EvidenceEvent = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: randomUUID(),
    evidenceRunId: runId,
    calderSessionId: meta.calderSessionId,
    providerId: meta.providerId,
    projectId: meta.projectId,
    type: 'summary_rebuilt',
    providerEventName: 'summary_rebuilt',
    timestamp: Date.now(),
    seq: meta.lastSeq + 1,
    source: 'derived_summary',
    confidence: 'verified',
    sanitizedMeta: { revision: nextRevision },
  };
  await appendEvent(runId, rebuildEvent, dataRootOverride);

  return writeMeta(
    runId,
    {
      ...meta,
      summaryRevision: nextRevision,
    },
    dataRootOverride,
  );
}

export function __resetFinalizationForTests(): void {
  for (const state of finalizationByRun.values()) {
    if (state.graceTimer) clearTimeout(state.graceTimer);
    if (state.sealTimer) clearTimeout(state.sealTimer);
  }
  finalizationByRun.clear();
}
