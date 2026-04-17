// Shared type definitions used across main, preload, and renderer processes.

// --- Provider ---

export type ProviderId = 'claude' | 'codex' | 'copilot' | 'gemini' | 'qwen' | 'minimax' | 'blackbox';
export type PendingPromptTrigger = 'session-start' | 'first-output' | 'startup-arg';
export type UiLanguage = 'en' | 'tr';

export interface CliProviderCapabilities {
  sessionResume: boolean;
  costTracking: boolean;
  contextWindow: boolean;
  hookStatus: boolean;
  configReading: boolean;
  shiftEnterNewline: boolean;
  pendingPromptTrigger: PendingPromptTrigger;
  planModeArg?: string;
}

export interface CliProviderMeta {
  id: ProviderId;
  displayName: string;
  binaryName: string;
  capabilities: CliProviderCapabilities;
  defaultContextWindowSize: number;
}

export type ProviderUpdateSource = 'self' | 'npm' | 'brew-formula' | 'brew-cask' | 'unknown';
export type ProviderUpdateStatus = 'updated' | 'up_to_date' | 'skipped' | 'error' | 'cancelled';

export interface ProviderUpdateResult {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  status: ProviderUpdateStatus;
  checked: boolean;
  updateAttempted: boolean;
  message: string;
  checkCommand?: string;
  updateCommand?: string;
  beforeVersion?: string;
  latestVersion?: string;
  afterVersion?: string;
  durationMs: number;
}

export interface ProviderUpdateSummary {
  startedAt: string;
  finishedAt: string;
  results: ProviderUpdateResult[];
  cancelled?: boolean;
}

export interface ProviderUpdateCancelResult {
  cancelled: boolean;
}

export type ProviderUpdateProgressPhase =
  | 'started'
  | 'provider_started'
  | 'provider_finished'
  | 'finished';

export interface ProviderUpdateProgressTarget {
  providerId: ProviderId;
  providerName: string;
}

export interface ProviderUpdateProgressEvent {
  phase: ProviderUpdateProgressPhase;
  startedAt: string;
  finishedAt?: string;
  cancelled?: boolean;
  totalProviders: number;
  completedProviders: number;
  providerId?: ProviderId;
  providerName?: string;
  providers?: ProviderUpdateProgressTarget[];
  result?: ProviderUpdateResult;
}

// --- Git ---

export interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
}

export interface GitFileEntry {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  area: 'staged' | 'working' | 'untracked' | 'conflicted';
}

// --- Provider Config ---

export interface McpServer { name: string; url: string; status: string; scope: 'user' | 'project'; filePath: string }
export interface Agent { name: string; model: string; category: 'plugin' | 'built-in'; scope: 'user' | 'project'; filePath: string }
export interface Skill { name: string; description: string; scope: 'user' | 'project'; filePath: string }
export interface Command { name: string; description: string; scope: 'user' | 'project'; filePath: string }
export interface ProviderConfig { mcpServers: McpServer[]; agents: Agent[]; skills: Skill[]; commands: Command[] }
export type ClaudeConfig = ProviderConfig;

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
  source?: 'structured' | 'fallback';
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
  type?: 'claude' | 'mcp-inspector' | 'diff-viewer' | 'file-reader' | 'remote-terminal' | 'browser-tab';
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
export type MosaicPreset = 'single' | 'columns-2' | 'rows-2' | 'focus-left' | 'focus-top' | 'grid-2x2';

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
    source?: 'structured' | 'fallback';
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

export type SurfaceKind = 'web' | 'cli';
export type SurfaceSelectionMode = 'line' | 'region' | 'viewport';
export type CliSurfacePromptContextMode = 'selection-only' | 'selection-nearby' | 'selection-nearby-viewport';

export interface WebSurfaceState {
  sessionId?: string;
  url?: string;
  history?: string[];
}

export interface EmbeddedBrowserOpenPayload {
  url: string;
  cwd?: string;
  preferEmbedded?: boolean;
}

export interface BrowserGuestOpenPayload {
  url: string;
  source: 'anchor' | 'window-open';
}

export interface ProjectContextSource {
  id: string;
  provider: ProviderId | 'shared';
  scope: 'project' | 'user';
  kind: 'memory' | 'rules' | 'instructions' | 'mcp';
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
  enabled?: boolean;
  priority?: 'hard' | 'soft';
}

export interface AppliedContextSourceRef {
  id: string;
  provider: ProviderId | 'shared';
  displayName: string;
  kind: ProjectContextSource['kind'];
  priority?: ProjectContextSource['priority'];
  summary?: string;
}

export interface AppliedContextSummary {
  sources: AppliedContextSourceRef[];
  sharedRuleCount: number;
  providerContextSummary?: string;
  sharedRulesSummary?: string;
}

export interface ProjectContextState {
  sources: ProjectContextSource[];
  sharedRuleCount: number;
  providerSourceCount: number;
  lastUpdated?: string;
}

export interface ProjectContextStarterFilesResult {
  created: string[];
  skipped: string[];
  state: ProjectContextState;
}

export interface ProjectContextCreateRuleResult {
  created: boolean;
  relativePath: string;
  state: ProjectContextState;
}

export interface ProjectContextRenameRuleResult {
  renamed: boolean;
  relativePath: string;
  state: ProjectContextState;
}

export interface ProjectContextDeleteRuleResult {
  deleted: boolean;
  state: ProjectContextState;
}

export interface ProjectWorkflowSource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
}

export interface ProjectWorkflowState {
  workflows: ProjectWorkflowSource[];
  lastUpdated?: string;
}

export interface ProjectWorkflowStarterFilesResult {
  created: string[];
  skipped: string[];
  state: ProjectWorkflowState;
}

export interface ProjectWorkflowCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectWorkflowState;
}

export interface ProjectWorkflowDocument {
  path: string;
  relativePath: string;
  title: string;
  contents: string;
}

export interface ProjectTeamContextSpaceSource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
  linkedRuleCount: number;
  linkedWorkflowCount: number;
}

export interface ProjectTeamContextState {
  spaces: ProjectTeamContextSpaceSource[];
  sharedRuleCount: number;
  workflowCount: number;
  lastUpdated?: string;
}

export interface ProjectTeamContextStarterFilesResult {
  created: string[];
  skipped: string[];
  state: ProjectTeamContextState;
}

export interface ProjectTeamContextCreateSpaceResult {
  created: boolean;
  relativePath: string;
  state: ProjectTeamContextState;
}

export interface ProjectReviewSource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
}

export interface ProjectReviewState {
  reviews: ProjectReviewSource[];
  lastUpdated?: string;
}

export interface ProjectReviewCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectReviewState;
}

export interface ProjectReviewDocument {
  path: string;
  relativePath: string;
  title: string;
  contents: string;
}

export type ProjectBackgroundTaskStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'cancelled';

export interface ProjectBackgroundTaskSource {
  id: string;
  path: string;
  title: string;
  status: ProjectBackgroundTaskStatus;
  summary: string;
  createdAt: string;
  lastUpdated: string;
  artifactCount: number;
  handoffSummary: string;
}

export interface ProjectBackgroundTaskState {
  tasks: ProjectBackgroundTaskSource[];
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  lastUpdated?: string;
}

export interface ProjectBackgroundTaskCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectBackgroundTaskState;
}

export interface ProjectBackgroundTaskDocument {
  path: string;
  relativePath: string;
  title: string;
  status: ProjectBackgroundTaskStatus;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  artifacts: string[];
  handoff: string;
}

export type ProjectGovernanceMode = 'advisory' | 'enforced';
export type ProjectGovernanceDecisionPolicy = 'allow' | 'ask' | 'block';
export type AutoApprovalMode = 'off' | 'edit_only' | 'edit_plus_safe_tools' | 'full_auto';
export type AutoApprovalPolicySource = 'global' | 'project' | 'session' | 'fallback';
export type AutoApprovalOperationClass = 'edit' | 'safe_tool' | 'risky_tool' | 'unknown' | 'destructive';
export type AutoApprovalDecision = 'allow' | 'ask' | 'block';

export interface ProjectGovernanceAutoApprovalDecisionRecord {
  timestamp: string;
  operationClass: AutoApprovalOperationClass;
  decision: AutoApprovalDecision;
  reason?: string;
}

export interface ProjectGovernanceAutoApprovalState {
  globalMode: AutoApprovalMode;
  projectMode?: AutoApprovalMode;
  sessionMode?: AutoApprovalMode;
  effectiveMode: AutoApprovalMode;
  policySource: AutoApprovalPolicySource;
  safeToolProfile: 'default-read-only';
  recentDecisions: ProjectGovernanceAutoApprovalDecisionRecord[];
}

export interface ProjectGovernancePolicySource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
  mode: 'advisory' | 'enforced';
  toolPolicy: 'allow' | 'ask' | 'block';
  writePolicy: 'allow' | 'ask' | 'block';
  networkPolicy: 'allow' | 'ask' | 'block';
  mcpAllowlistCount: number;
  providerProfileCount: number;
  budgetLimitUsd?: number;
}

export interface ProjectGovernanceState {
  policy?: ProjectGovernancePolicySource;
  autoApproval?: ProjectGovernanceAutoApprovalState;
  lastUpdated?: string;
}

export interface ProjectGovernanceStarterPolicyResult {
  created: boolean;
  relativePath: string;
  state: ProjectGovernanceState;
}

export interface ProjectCheckpointSnapshotSession {
  id: string;
  name: string;
  type?: SessionRecord['type'];
  providerId?: ProviderId;
  args?: string;
  cliSessionId: string | null;
  browserTabUrl?: string;
  browserTargetSessionId?: string;
  diffFilePath?: string;
  diffArea?: string;
  worktreePath?: string;
  fileReaderPath?: string;
  fileReaderLine?: number;
}

export interface ProjectCheckpointSnapshotInput {
  label: string;
  createdAt?: string;
  projectName: string;
  activeSessionId: string | null;
  sessions: ProjectCheckpointSnapshotSession[];
  surface?: {
    kind: SurfaceKind;
    active: boolean;
    targetSessionId?: string;
    webUrl?: string;
    webSessionId?: string;
    cliSelectedProfileId?: string;
    cliStatus?: CliSurfaceRuntimeState['status'];
  };
  projectContext?: {
    sharedRuleCount: number;
    providerSourceCount: number;
  };
  projectWorkflows?: {
    workflowCount: number;
  };
  projectTeamContext?: {
    spaceCount: number;
    sharedRuleCount: number;
    workflowCount: number;
  };
}

export interface ProjectCheckpointSource {
  id: string;
  path: string;
  displayName: string;
  label: string;
  createdAt: string;
  lastUpdated: string;
  sessionCount: number;
  changedFileCount: number;
  restoreSummary: string;
}

export type ProjectCheckpointRestoreMode = 'additive' | 'replace';

export interface ProjectCheckpointState {
  checkpoints: ProjectCheckpointSource[];
  lastUpdated?: string;
}

export interface ProjectCheckpointCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectCheckpointState;
}

export interface ProjectCheckpointDocument {
  schemaVersion: number;
  id: string;
  label: string;
  createdAt: string;
  project: {
    name: string;
    path: string;
  };
  activeSessionId: string | null;
  sessionCount: number;
  changedFileCount: number;
  sessions: ProjectCheckpointSnapshotSession[];
  surface?: ProjectCheckpointSnapshotInput['surface'];
  projectContext?: ProjectCheckpointSnapshotInput['projectContext'];
  projectWorkflows?: ProjectCheckpointSnapshotInput['projectWorkflows'];
  projectTeamContext?: ProjectCheckpointSnapshotInput['projectTeamContext'];
  git: {
    isGitRepo: boolean;
    branch: string | null;
    ahead: number;
    behind: number;
    changedFiles: GitFileEntry[];
  };
}

export interface CliSurfaceProfile {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  envPatch?: Record<string, string>;
  cols?: number;
  rows?: number;
  startupReadyPattern?: string;
  restartPolicy?: 'manual' | 'on-exit';
}

export interface CliSurfaceStartupTiming {
  startedAtMs: number;
  ptySpawnedAtMs?: number;
  spawnLatencyMs?: number;
  firstOutputAtMs?: number;
  firstOutputLatencyMs?: number;
  runningAtMs?: number;
  stoppedAtMs?: number;
  totalRuntimeMs?: number;
}

export interface CliSurfaceRuntimeState {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
  runtimeId?: string;
  selectedProfileId?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  lastExitCode?: number | null;
  lastError?: string | null;
  startupTiming?: CliSurfaceStartupTiming;
}

export type CliSurfaceDiscoveryConfidence = 'high' | 'medium' | 'low';

export interface CliSurfaceDiscoveryCandidate {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  source: string;
  reason: string;
  confidence: CliSurfaceDiscoveryConfidence;
}

export interface CliSurfaceDiscoveryResult {
  confidence: CliSurfaceDiscoveryConfidence;
  candidates: CliSurfaceDiscoveryCandidate[];
}

export interface CliSurfaceState {
  selectedProfileId?: string;
  profiles: CliSurfaceProfile[];
  runtime?: CliSurfaceRuntimeState;
}

export interface ProjectSurfaceRecord {
  kind: SurfaceKind;
  active: boolean;
  tabFocus?: 'session' | 'cli';
  targetSessionId?: string;
  web?: WebSurfaceState;
  cli?: CliSurfaceState;
}

export interface SurfaceSelectionRange {
  mode: SurfaceSelectionMode;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface SurfacePromptPayload {
  projectId: string;
  projectPath: string;
  surfaceKind: SurfaceKind;
  selection: SurfaceSelectionRange;
  appliedContext?: AppliedContextSummary;
  contextMode?: CliSurfacePromptContextMode;
  selectionSource?: 'exact' | 'inferred' | 'semantic';
  semanticNodeId?: string;
  semanticLabel?: string;
  sourceFile?: string;
  selectedText: string;
  nearbyText: string;
  viewportText: string;
  ansiSnapshot?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  title?: string;
  inferredLabel?: string;
  adapterMeta?: Record<string, unknown>;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  surface?: ProjectSurfaceRecord;
  projectContext?: ProjectContextState;
  projectWorkflows?: ProjectWorkflowState;
  projectTeamContext?: ProjectTeamContextState;
  projectReviews?: ProjectReviewState;
  projectGovernance?: ProjectGovernanceState;
  projectBackgroundTasks?: ProjectBackgroundTaskState;
  projectCheckpoints?: ProjectCheckpointState;
  layout: ProjectLayoutState;
  sessionHistory?: ArchivedSession[];
  insights?: ProjectInsightsData;
  defaultArgs?: string;
  terminalPanelOpen?: boolean;
  terminalPanelHeight?: number;
}

export interface Preferences {
  soundOnSessionWaiting: boolean;
  notificationsDesktop: boolean;
  debugMode: boolean;
  sessionHistoryEnabled: boolean;
  insightsEnabled: boolean;
  autoTitleEnabled: boolean;
  language?: UiLanguage;
  defaultProvider?: ProviderId;
  statusLineConsent?: 'granted' | 'declined' | null;
  keybindings?: Record<string, string>;
  sidebarViews?: {
    configSections: boolean;
    gitPanel: boolean;
    sessionHistory: boolean;
    costFooter: boolean;
  };
}

// --- Settings Validation ---

export interface SettingsValidationResult {
  statusLine: 'missing' | 'calder' | 'foreign';
  hooks: 'missing' | 'complete' | 'partial';
  foreignStatusLineCommand?: string;
  hookDetails: Record<string, boolean>;
}

export interface SettingsWarningData {
  sessionId: string;
  providerId: ProviderId;
  statusLine: SettingsValidationResult['statusLine'];
  hooks: SettingsValidationResult['hooks'];
}

export interface StatusLineConflictData {
  foreignCommand: string;
}

export interface PersistedState {
  version: 1;
  projects: ProjectRecord[];
  activeProjectId: string | null;
  preferences: Preferences;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  lastSeenVersion?: string;
  appLaunchCount?: number;
  starPromptDismissed?: boolean;
}

// --- Cost / Context ---

export interface CostData {
  cost: { total_cost_usd?: number; total_duration_ms?: number; total_api_duration_ms?: number };
  model?: string;
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
  | 'session_start' | 'user_prompt' | 'tool_use' | 'tool_failure'
  | 'stop' | 'stop_failure' | 'permission_request'
  // Inspector-only events
  | 'permission_denied'
  | 'pre_tool_use'
  | 'subagent_start' | 'subagent_stop'
  | 'notification'
  | 'pre_compact' | 'post_compact'
  | 'session_end'
  | 'task_created' | 'task_completed'
  | 'worktree_create' | 'worktree_remove'
  | 'cwd_changed' | 'file_changed' | 'config_change'
  | 'elicitation' | 'elicitation_result'
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

// --- MCP ---

export interface McpResult {
  success: boolean;
  data?: unknown;
  error?: string;
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
