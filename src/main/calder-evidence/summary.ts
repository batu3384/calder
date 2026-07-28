import type {
  EvidenceCompletionState,
  EvidenceEvent,
  EvidenceEventCounts,
  EvidenceEventType,
  EvidenceHealth,
  EvidenceRunMeta,
  EvidenceSummary,
  GitComparisonResult,
} from '../../shared/types-evidence.js';
import {
  EVIDENCE_SCHEMA_VERSION,
  MAX_SUMMARY_GIT_OBSERVATIONS,
} from '../../shared/types-evidence.js';

function countEvents(events: EvidenceEvent[]): EvidenceEventCounts {
  const byType: Partial<Record<EvidenceEventType, number>> = {};
  const counts: EvidenceEventCounts = {
    total: events.length,
    byType,
    toolRequested: 0,
    toolStarted: 0,
    toolFailed: 0,
    permissionRequested: 0,
    permissionDenied: 0,
    policyDecisions: 0,
    promptSubmitted: 0,
    costSnapshots: 0,
  };

  for (const event of events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    switch (event.type) {
      case 'tool_requested':
        counts.toolRequested++;
        break;
      case 'tool_started':
        counts.toolStarted++;
        break;
      case 'tool_failed':
        counts.toolFailed++;
        break;
      case 'permission_requested':
        counts.permissionRequested++;
        break;
      case 'permission_denied':
        counts.permissionDenied++;
        break;
      case 'policy_decision':
        counts.policyDecisions++;
        break;
      case 'prompt_submitted':
        counts.promptSubmitted++;
        break;
      case 'cost_snapshot':
        counts.costSnapshots++;
        break;
      default:
        break;
    }
  }

  return counts;
}

export function buildEvidenceSummary(params: {
  meta: EvidenceRunMeta;
  events: EvidenceEvent[];
  gitObservations: GitComparisonResult | null;
  completionState: EvidenceCompletionState;
  health: EvidenceHealth;
}): EvidenceSummary {
  const { meta, events, gitObservations, completionState, health } = params;
  const revision = meta.summaryRevision;

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    runId: meta.runId,
    revision,
    generatedAt: new Date().toISOString(),
    completionState,
    coverage: health.coverage,
    eventCounts: countEvents(events),
    gitObservationCount: gitObservations?.observations.length ?? 0,
    gitTruncated: gitObservations?.truncated ?? false,
    gitObservations: gitObservations?.observations.slice(0, MAX_SUMMARY_GIT_OBSERVATIONS),
    healthGaps: health.gaps.map((gap) => gap.code),
    lateEventCount: health.lateEventCount,
    summaryStale: health.summaryStale,
  };
}
