import { z } from 'zod';

import type { ProviderId } from './types-provider';

export const EVIDENCE_SCHEMA_VERSION = 1 as const;
export const CLOSING_GRACE_MS = 2000;
export const LATE_EVENT_WINDOW_MS = 5000;
export const MAX_FINGERPRINT_PATHS = 200;
export const MAX_FINGERPRINT_FILE_BYTES = 512_000;

export type EvidenceSource =
  | 'provider_hook'
  | 'provider_session_log'
  | 'calder_pty'
  | 'calder_governance'
  | 'calder_git'
  | 'calder_runtime'
  | 'user_annotation'
  | 'derived_summary'
  | 'external_adapter';

export type EvidenceConfidence = 'verified' | 'provider_reported' | 'inferred' | 'unavailable';

export type EvidenceCompletionState = 'completed' | 'failed' | 'unknown' | 'interrupted';

export type EvidenceRunState = 'open' | 'closing' | 'finalized' | 'sealed';

export type EvidenceEventType =
  | 'evidence_run_started'
  | 'pty_started'
  | 'pty_exited'
  | 'provider_session_started'
  | 'provider_session_completed'
  | 'provider_session_failed'
  | 'session_started'
  | 'session_resumed'
  | 'prompt_submitted'
  | 'tool_requested'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'permission_requested'
  | 'permission_approved'
  | 'permission_denied'
  | 'operation_blocked'
  | 'policy_decision'
  | 'file_change_reported'
  | 'git_state_captured'
  | 'git_change_observed'
  | 'cwd_changed'
  | 'config_changed'
  | 'subagent_started'
  | 'subagent_completed'
  | 'task_created'
  | 'task_completed'
  | 'context_compaction_started'
  | 'context_compaction_completed'
  | 'cost_snapshot'
  | 'tracking_health_changed'
  | 'session_completed'
  | 'session_failed'
  | 'session_interrupted'
  | 'session_ended'
  | 'export_created'
  | 'review_status_changed'
  | 'review_note_added'
  | 'summary_rebuilt';

export type EvidenceCoverage = 'full' | 'partial' | 'minimal' | 'unavailable';

export type GitObservationCategory =
  | 'added_during_window'
  | 'modified_during_window'
  | 'deleted_during_window'
  | 'renamed'
  | 'dirty_at_start_unchanged'
  | 'dirty_at_start_changed_further_during_window'
  | 'clean_at_start_dirty_at_end'
  | 'head_moved'
  | 'commits_observed'
  | 'conflict_observed'
  | 'untracked_added'
  | 'unavailable';

export interface EvidencePolicyDecisionRef {
  policySource: string;
  effectiveMode: string;
  operationClass: string;
  decision: string;
  reason?: string;
}

export interface EvidenceEvent {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  eventId: string;
  evidenceRunId: string;
  calderSessionId: string;
  providerId: ProviderId | string;
  projectId: string;
  type: EvidenceEventType;
  providerEventName?: string;
  timestamp: number;
  seq: number;
  source: EvidenceSource;
  confidence: EvidenceConfidence;
  toolName?: string;
  sanitizedMeta?: Record<string, unknown>;
  sanitizedPaths?: string[];
  policyDecision?: EvidencePolicyDecisionRef;
  outcome?: string;
  redactionTypes?: string[];
  redactedFieldCount?: number;
  parentEventId?: string;
  subagentId?: string;
  taskId?: string;
}

export interface EvidenceRunMeta {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  runId: string;
  calderSessionId: string;
  providerId: ProviderId | string;
  projectId: string;
  projectPath: string;
  state: EvidenceRunState;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completionState: EvidenceCompletionState;
  providerCliSessionId?: string | null;
  gitBaselineCapturedAt?: string;
  gitFinalCapturedAt?: string;
  summaryRevision: number;
  lateEventAcceptUntil?: number;
  closingStartedAt?: number;
  eventCount: number;
  lastSeq: number;
}

export interface EvidenceEventCounts {
  total: number;
  byType: Partial<Record<EvidenceEventType, number>>;
  toolRequested: number;
  toolStarted: number;
  toolFailed: number;
  permissionRequested: number;
  permissionDenied: number;
  policyDecisions: number;
  promptSubmitted: number;
  costSnapshots: number;
}

export interface EvidenceSummary {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  runId: string;
  revision: number;
  generatedAt: string;
  completionState: EvidenceCompletionState;
  coverage: EvidenceCoverage;
  eventCounts: EvidenceEventCounts;
  gitObservationCount: number;
  gitTruncated: boolean;
  gitObservations?: GitObservation[];
  healthGaps: string[];
  lateEventCount: number;
  summaryStale: boolean;
}

export type EvidenceReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

export interface EvidenceReview {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  runId: string;
  status: EvidenceReviewStatus;
  notes?: string;
  updatedAt: string;
}

export interface EvidenceHealthGap {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface EvidenceHealth {
  coverage: EvidenceCoverage;
  gaps: EvidenceHealthGap[];
  lateEventCount: number;
  summaryStale: boolean;
  providerId: ProviderId | string;
  eventCount: number;
  hasProviderSessionEnd: boolean;
  hasPtyExit: boolean;
  hasGitBaseline: boolean;
  hasGitFinal: boolean;
}

export interface GitPathFingerprint {
  path: string;
  area: 'staged' | 'working' | 'untracked' | 'conflicted';
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  indexOid?: string;
  worktreeFingerprint?: string;
  sizeBytes?: number;
  fingerprintUnavailable?: boolean;
}

export interface GitFingerprintSnapshot {
  capturedAt: string;
  isGitRepo: boolean;
  branch: string | null;
  headCommit: string | null;
  paths: GitPathFingerprint[];
  truncated: boolean;
}

export interface GitObservation {
  path: string;
  category: GitObservationCategory;
  confidence: EvidenceConfidence;
  previousPath?: string;
  metadata?: Record<string, unknown>;
}

export interface GitComparisonResult {
  observations: GitObservation[];
  truncated: boolean;
  headMoved: boolean;
  branchChanged: boolean;
}

export interface EvidenceSettings {
  enabled: boolean;
  pixelMode: 'off' | 'compact';
}

export const EvidenceEventTypeSchema = z.enum([
  'evidence_run_started',
  'pty_started',
  'pty_exited',
  'provider_session_started',
  'provider_session_completed',
  'provider_session_failed',
  'session_started',
  'session_resumed',
  'prompt_submitted',
  'tool_requested',
  'tool_started',
  'tool_completed',
  'tool_failed',
  'permission_requested',
  'permission_approved',
  'permission_denied',
  'operation_blocked',
  'policy_decision',
  'file_change_reported',
  'git_state_captured',
  'git_change_observed',
  'cwd_changed',
  'config_changed',
  'subagent_started',
  'subagent_completed',
  'task_created',
  'task_completed',
  'context_compaction_started',
  'context_compaction_completed',
  'cost_snapshot',
  'tracking_health_changed',
  'session_completed',
  'session_failed',
  'session_interrupted',
  'session_ended',
  'export_created',
  'review_status_changed',
  'review_note_added',
  'summary_rebuilt',
]);

export const EvidenceSourceSchema = z.enum([
  'provider_hook',
  'provider_session_log',
  'calder_pty',
  'calder_governance',
  'calder_git',
  'calder_runtime',
  'user_annotation',
  'derived_summary',
  'external_adapter',
]);

export const EvidenceSettingsSchema = z.object({
  enabled: z.boolean(),
  pixelMode: z.enum(['off', 'compact']),
});

export const EvidenceRunMetaSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
  runId: z.string().min(1),
  calderSessionId: z.string().min(1),
  providerId: z.string().min(1),
  projectId: z.string().min(1),
  projectPath: z.string().min(1),
  state: z.enum(['open', 'closing', 'finalized', 'sealed']),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  completedAt: z.string().optional(),
  completionState: z.enum(['completed', 'failed', 'unknown', 'interrupted']),
  providerCliSessionId: z.string().nullable().optional(),
  gitBaselineCapturedAt: z.string().optional(),
  gitFinalCapturedAt: z.string().optional(),
  summaryRevision: z.number().int().nonnegative(),
  lateEventAcceptUntil: z.number().optional(),
  closingStartedAt: z.number().optional(),
  eventCount: z.number().int().nonnegative(),
  lastSeq: z.number().int().nonnegative(),
});

export const EvidenceEventSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
  eventId: z.string().min(1),
  evidenceRunId: z.string().min(1),
  calderSessionId: z.string().min(1),
  providerId: z.string().min(1),
  projectId: z.string().min(1),
  type: EvidenceEventTypeSchema,
  providerEventName: z.string().optional(),
  timestamp: z.number(),
  seq: z.number().int().nonnegative(),
  source: EvidenceSourceSchema,
  confidence: z.enum(['verified', 'provider_reported', 'inferred', 'unavailable']),
  toolName: z.string().optional(),
  sanitizedMeta: z.record(z.unknown()).optional(),
  sanitizedPaths: z.array(z.string()).optional(),
  policyDecision: z
    .object({
      policySource: z.string(),
      effectiveMode: z.string(),
      operationClass: z.string(),
      decision: z.string(),
      reason: z.string().optional(),
    })
    .optional(),
  outcome: z.string().optional(),
  redactionTypes: z.array(z.string()).optional(),
  redactedFieldCount: z.number().int().nonnegative().optional(),
  parentEventId: z.string().optional(),
  subagentId: z.string().optional(),
  taskId: z.string().optional(),
});

export const GitObservationSchema = z.object({
  path: z.string().min(1),
  category: z.enum([
    'added_during_window',
    'modified_during_window',
    'deleted_during_window',
    'renamed',
    'dirty_at_start_unchanged',
    'dirty_at_start_changed_further_during_window',
    'clean_at_start_dirty_at_end',
    'head_moved',
    'commits_observed',
    'conflict_observed',
    'untracked_added',
    'unavailable',
  ]),
  confidence: z.enum(['verified', 'provider_reported', 'inferred', 'unavailable']),
  previousPath: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const MAX_SUMMARY_GIT_OBSERVATIONS = 500;

export const EvidenceSummarySchema = z.object({
  schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
  runId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  generatedAt: z.string().min(1),
  completionState: z.enum(['completed', 'failed', 'unknown', 'interrupted']),
  coverage: z.enum(['full', 'partial', 'minimal', 'unavailable']),
  eventCounts: z.object({
    total: z.number().int().nonnegative(),
    byType: z.record(z.number().int().nonnegative()),
    toolRequested: z.number().int().nonnegative(),
    toolStarted: z.number().int().nonnegative(),
    toolFailed: z.number().int().nonnegative(),
    permissionRequested: z.number().int().nonnegative(),
    permissionDenied: z.number().int().nonnegative(),
    policyDecisions: z.number().int().nonnegative(),
    promptSubmitted: z.number().int().nonnegative(),
    costSnapshots: z.number().int().nonnegative(),
  }),
  gitObservationCount: z.number().int().nonnegative(),
  gitTruncated: z.boolean(),
  gitObservations: z.array(GitObservationSchema).max(MAX_SUMMARY_GIT_OBSERVATIONS).optional(),
  healthGaps: z.array(z.string()),
  lateEventCount: z.number().int().nonnegative(),
  summaryStale: z.boolean(),
});

export const EvidenceReviewSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
  runId: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'needs_changes']),
  notes: z.string().optional(),
  updatedAt: z.string().min(1),
});

export const DEFAULT_EVIDENCE_SETTINGS: EvidenceSettings = {
  enabled: true,
  pixelMode: 'off',
};
