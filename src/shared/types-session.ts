// Shared session and telemetry type definitions.

import type {
  AutoApprovalDecision,
  AutoApprovalMode,
  AutoApprovalOperationClass,
  AutoApprovalPolicySource,
} from './types-governance';
import type { ProviderId } from './types-provider';

// --- Cost / Context (shared with renderer modules) ---

export interface CostInfo {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalDurationMs: number;
  totalApiDurationMs: number;
  model?: string;
  source?: 'structured' | 'fallback' | 'derived';
}

export interface ContextWindowInfo {
  totalTokens: number;
  contextWindowSize: number;
  usedPercentage: number;
}

// --- Session / State ---

export interface SessionRecord {
  id: string;
  name: string;
  type?:
    | 'claude'
    | 'mcp-inspector'
    | 'diff-viewer'
    | 'file-reader'
    | 'remote-terminal'
    | 'browser-tab';
  providerId?: ProviderId;
  args?: string;
  cliSessionId: string | null;
  /** @deprecated Use cliSessionId instead. Kept for state migration compatibility. */
  claudeSessionId?: string | null;
  mcpServerUrl?: string;
  diffFilePath?: string;
  diffArea?: string;
  worktreePath?: string;
  fileReaderPath?: string;
  fileReaderLine?: number;
  createdAt: string;
  userRenamed?: boolean;
  cost?: CostInfo;
  contextWindow?: ContextWindowInfo;
  remoteHostName?: string;
  shareMode?: 'readonly' | 'readwrite';
  browserTabUrl?: string;
  browserTargetSessionId?: string;
  /** Transient: initial prompt to inject on first spawn. Not persisted. */
  pendingInitialPrompt?: string;
}

export type ProjectLayoutMode = 'tabs' | 'mosaic';
export type MosaicPreset =
  | 'single'
  | 'columns-2'
  | 'rows-2'
  | 'focus-left'
  | 'focus-top'
  | 'grid-2x2';

export interface ProjectLayoutState {
  mode: ProjectLayoutMode;
  splitPanes: string[];
  splitDirection: 'horizontal' | 'vertical';
  browserWidthRatio?: number;
  mosaicPreset?: MosaicPreset;
  mosaicRatios?: Record<string, number>;
}

export interface ArchivedSession {
  id: string;
  name: string;
  providerId: ProviderId;
  cliSessionId: string | null;
  createdAt: string;
  closedAt: string;
  bookmarked?: boolean;
  cost: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalDurationMs: number;
    source?: 'structured' | 'fallback' | 'derived';
  } | null;
}

export interface InitialContextSnapshot {
  sessionId: string;
  timestamp: string;
  totalTokens: number;
  contextWindowSize: number;
  usedPercentage: number;
}

export interface ProjectInsightsData {
  initialContextSnapshots: InitialContextSnapshot[];
  dismissed: string[];
}
// --- Cost / Context ---

export interface CostData {
  cost: { total_cost_usd?: number; total_duration_ms?: number; total_api_duration_ms?: number };
  model?: string;
  source?: 'structured' | 'fallback' | 'derived';
  context_window: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_tokens?: number;
    context_window_size?: number;
    used_percentage?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

// --- Tool Failure ---

export interface ToolFailureData {
  tool_name: string;
  tool_input: Record<string, unknown>;
  error: string;
}

// --- Session Inspector ---

export type InspectorEventType =
  // Core 7 (status + inspector)
  | 'session_start'
  | 'user_prompt'
  | 'tool_use'
  | 'tool_failure'
  | 'stop'
  | 'stop_failure'
  | 'permission_request'
  // Inspector-only events
  | 'permission_denied'
  | 'pre_tool_use'
  | 'subagent_start'
  | 'subagent_stop'
  | 'notification'
  | 'pre_compact'
  | 'post_compact'
  | 'session_end'
  | 'task_created'
  | 'task_completed'
  | 'worktree_create'
  | 'worktree_remove'
  | 'cwd_changed'
  | 'file_changed'
  | 'config_change'
  | 'elicitation'
  | 'elicitation_result'
  | 'instructions_loaded'
  | 'approval_decision'
  | 'teammate_idle'
  | 'status_update';

export interface InspectorEvent {
  type: InspectorEventType;
  timestamp: number;
  hookEvent: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: string;
  cost_snapshot?: { total_cost_usd: number; total_duration_ms: number };
  context_snapshot?: { total_tokens: number; context_window_size: number; used_percentage: number };
  agent_id?: string;
  agent_type?: string;
  last_assistant_message?: string;
  agent_transcript_path?: string;
  message?: string;
  task_id?: string;
  worktree_path?: string;
  cwd?: string;
  file_path?: string;
  config_key?: string;
  question?: string;
  answer?: string;
  // Snake_case matches the hook payload shape emitted by the inspector bridge.
  auto_approval?: {
    policy_source: AutoApprovalPolicySource;
    effective_mode: AutoApprovalMode;
    operation_class: AutoApprovalOperationClass;
    decision: AutoApprovalDecision;
    reason?: string;
  };
}

export interface ToolUsageStats {
  tool_name: string;
  calls: number;
  failures: number;
  totalCost: number;
}

export interface ContextDataPoint {
  timestamp: number;
  usedPercentage: number;
  totalTokens: number;
}

// --- Usage Stats ---

export interface StatsDailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface StatsModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
}

export interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: StatsDailyActivity[];
  dailyModelTokens: { date: string; tokensByModel: Record<string, number> }[];
  modelUsage: Record<string, StatsModelUsage>;
  totalSessions: number;
  totalMessages: number;
  longestSession: { sessionId: string; duration: number; messageCount: number; timestamp: string };
  firstSessionDate: string;
  hourCounts: Record<string, number>;
}
