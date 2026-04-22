// Shared project and surface type definitions.

import type { ShareIceServer } from './sharing-types';
import type { ProjectGovernanceState } from './types-governance';
import type { ProjectInsightsData, ProjectLayoutState, SessionRecord, ArchivedSession } from './types-session';
import type { ProviderId, UiLanguage } from './types-provider';

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
// --- Browser Credential Vault ---

export interface BrowserCredentialSummary {
  id: string;
  origin: string;
  label: string;
  username: string;
  autoFill: boolean;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface BrowserCredentialFillData {
  id: string;
  origin: string;
  label: string;
  username: string;
  password: string;
}

export interface BrowserCredentialSaveInput {
  url: string;
  username: string;
  password: string;
  label?: string;
  autoFill?: boolean;
  id?: string;
}

export type SurfaceKind = 'web' | 'cli' | 'mobile';
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
  sessionId?: string;
  preferEmbedded?: boolean;
}

export interface ShareRtcConfig {
  iceServers: ShareIceServer[];
  iceTransportPolicy?: 'all' | 'relay';
  source?: 'default' | 'env';
  issues?: string[];
}

export interface ShareConnectionDescription {
  type: 'offer' | 'answer';
  sdp: string;
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
  portMode?: CliSurfacePortMode;
  preferredPort?: number;
  allowPortFallback?: boolean;
}

export type CliSurfacePortMode = 'auto' | 'fixed' | 'off';

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
  resolvedPort?: number;
  resolvedUrl?: string;
  portMode?: CliSurfacePortMode;
  portFallbackUsed?: boolean;
  portReason?: string;
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
  tabFocus?: 'session' | 'cli' | 'mobile';
  tabPlacement?: 'start' | 'end';
  tabOrder?: Array<'cli' | 'mobile'>;
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
// --- MCP ---

export interface McpResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
