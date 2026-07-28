import type {
  EvidenceCoverage,
  EvidenceEvent,
  EvidenceHealth,
  EvidenceHealthGap,
  EvidenceRunMeta,
} from '../../shared/types-evidence.js';
import { LATE_EVENT_WINDOW_MS } from '../../shared/types-evidence.js';

function hasEventType(events: EvidenceEvent[], type: EvidenceEvent['type']): boolean {
  return events.some((event) => event.type === type);
}

function coverageFromSignals(signals: {
  hasProviderStart: boolean;
  hasProviderEnd: boolean;
  hasPtyStart: boolean;
  hasPtyExit: boolean;
  hasGitBaseline: boolean;
  hasGitFinal: boolean;
  eventCount: number;
}): EvidenceCoverage {
  const providerCoverage = signals.hasProviderStart && signals.hasProviderEnd;
  const runtimeCoverage = signals.hasPtyStart && signals.hasPtyExit;
  const gitCoverage = signals.hasGitBaseline && signals.hasGitFinal;

  if (providerCoverage && runtimeCoverage && gitCoverage) return 'full';
  if ((providerCoverage || runtimeCoverage) && signals.eventCount > 0) return 'partial';
  if (signals.eventCount > 0) return 'minimal';
  return 'unavailable';
}

export function evaluateEvidenceHealth(params: {
  meta: EvidenceRunMeta;
  events: EvidenceEvent[];
  providerId: string;
}): EvidenceHealth {
  const { meta, events, providerId } = params;
  const gaps: EvidenceHealthGap[] = [];

  const hasProviderStart = hasEventType(events, 'provider_session_started');
  const hasProviderEnd =
    hasEventType(events, 'provider_session_completed') ||
    hasEventType(events, 'provider_session_failed');
  const hasPtyStart = hasEventType(events, 'pty_started');
  const hasPtyExit = hasEventType(events, 'pty_exited');
  const hasGitBaseline = Boolean(meta.gitBaselineCapturedAt);
  const hasGitFinal = Boolean(meta.gitFinalCapturedAt);

  if (!hasProviderStart) {
    gaps.push({
      code: 'missing_provider_session_start',
      message: 'Provider session start was not observed.',
      severity: 'warning',
    });
  }
  if (!hasProviderEnd && meta.completionState !== 'interrupted') {
    gaps.push({
      code: 'missing_provider_session_end',
      message: 'Provider session end was not observed.',
      severity: 'warning',
    });
  }
  if (!hasPtyStart) {
    gaps.push({
      code: 'missing_pty_start',
      message: 'PTY start was not recorded.',
      severity: 'info',
    });
  }
  if (!hasPtyExit && meta.state !== 'open') {
    gaps.push({
      code: 'missing_pty_exit',
      message: 'PTY exit was not recorded.',
      severity: 'warning',
    });
  }
  if (!hasGitBaseline) {
    gaps.push({
      code: 'missing_git_baseline',
      message: 'Git baseline was not captured.',
      severity: 'info',
    });
  }
  if (!hasGitFinal && (meta.state === 'finalized' || meta.state === 'sealed')) {
    gaps.push({
      code: 'missing_git_final',
      message: 'Final Git snapshot was not captured.',
      severity: 'warning',
    });
  }

  const lateEventCount =
    meta.lateEventAcceptUntil !== undefined
      ? events.filter(
          (event) =>
            event.timestamp > (meta.closingStartedAt ?? 0) && event.type !== 'summary_rebuilt',
        ).length
      : 0;

  const summaryStale =
    meta.state === 'open' ||
    meta.state === 'closing' ||
    (meta.state === 'finalized' && Date.now() > (meta.lateEventAcceptUntil ?? 0));

  const coverage = coverageFromSignals({
    hasProviderStart,
    hasProviderEnd,
    hasPtyStart,
    hasPtyExit,
    hasGitBaseline,
    hasGitFinal,
    eventCount: events.length,
  });

  if (meta.completionState === 'interrupted') {
    gaps.push({
      code: 'session_interrupted',
      message: 'Evidence run was interrupted before normal completion.',
      severity: 'error',
    });
  }

  if (
    meta.state === 'finalized' &&
    meta.lateEventAcceptUntil &&
    Date.now() <= meta.lateEventAcceptUntil
  ) {
    gaps.push({
      code: 'late_event_window_open',
      message: `Late events accepted for ${LATE_EVENT_WINDOW_MS}ms after finalization.`,
      severity: 'info',
    });
  }

  return {
    coverage,
    gaps,
    lateEventCount,
    summaryStale,
    providerId,
    eventCount: events.length,
    hasProviderSessionEnd: hasProviderEnd,
    hasPtyExit,
    hasGitBaseline,
    hasGitFinal,
  };
}
