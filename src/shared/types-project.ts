// Shared project and surface type definitions (compatibility barrel).

export type {
  ProjectBackgroundTaskCreateResult,
  ProjectBackgroundTaskDocument,
  ProjectBackgroundTaskSource,
  ProjectBackgroundTaskState,
  ProjectBackgroundTaskStatus,
} from './types/project-background-task.js';
export type {
  ProjectCheckpointCreateResult,
  ProjectCheckpointDocument,
  ProjectCheckpointRestoreMode,
  ProjectCheckpointSnapshotInput,
  ProjectCheckpointSnapshotSession,
  ProjectCheckpointSource,
  ProjectCheckpointState,
} from './types/project-checkpoint.js';
export type {
  AppliedContextSourceRef,
  AppliedContextSummary,
  ProjectContextCreateRuleResult,
  ProjectContextDeleteRuleResult,
  ProjectContextRenameRuleResult,
  ProjectContextSource,
  ProjectContextStarterFilesResult,
  ProjectContextState,
} from './types/project-context.js';
export type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
  BrowserGuestOpenPayload,
  CliSurfacePromptContextMode,
  EmbeddedBrowserOpenPayload,
  GitFileEntry,
  GitWorktree,
  McpResult,
  ShareConnectionDescription,
  ShareRtcConfig,
  SurfaceKind,
  SurfaceSelectionMode,
  WebSurfaceState,
} from './types/project-core.js';
export type {
  ProjectReviewCreateResult,
  ProjectReviewDocument,
  ProjectReviewSource,
  ProjectReviewState,
} from './types/project-review.js';
export type { PersistedState, Preferences, ProjectRecord } from './types/project-state.js';
export type {
  CliSurfaceDiscoveryCandidate,
  CliSurfaceDiscoveryConfidence,
  CliSurfaceDiscoveryResult,
  CliSurfacePortMode,
  CliSurfaceProfile,
  CliSurfaceRuntimeState,
  CliSurfaceStartupTiming,
  CliSurfaceState,
  ProjectSurfaceRecord,
  SurfacePromptPayload,
  SurfaceSelectionRange,
} from './types/project-surface.js';
export type {
  ProjectTeamContextCreateSpaceResult,
  ProjectTeamContextSpaceSource,
  ProjectTeamContextStarterFilesResult,
  ProjectTeamContextState,
} from './types/project-team-context.js';
export type {
  ProjectWorkflowCreateResult,
  ProjectWorkflowDocument,
  ProjectWorkflowSource,
  ProjectWorkflowStarterFilesResult,
  ProjectWorkflowState,
} from './types/project-workflow.js';
