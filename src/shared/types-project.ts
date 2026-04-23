// Shared project and surface type definitions (compatibility barrel).

export type {
  GitWorktree,
  GitFileEntry,
  BrowserCredentialSummary,
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  SurfaceKind,
  SurfaceSelectionMode,
  CliSurfacePromptContextMode,
  WebSurfaceState,
  EmbeddedBrowserOpenPayload,
  ShareRtcConfig,
  ShareConnectionDescription,
  BrowserGuestOpenPayload,
  McpResult,
} from './types/project-core.js';

export type {
  ProjectContextSource,
  AppliedContextSourceRef,
  AppliedContextSummary,
  ProjectContextState,
  ProjectContextStarterFilesResult,
  ProjectContextCreateRuleResult,
  ProjectContextRenameRuleResult,
  ProjectContextDeleteRuleResult,
} from './types/project-context.js';

export type {
  ProjectWorkflowSource,
  ProjectWorkflowState,
  ProjectWorkflowStarterFilesResult,
  ProjectWorkflowCreateResult,
  ProjectWorkflowDocument,
} from './types/project-workflow.js';

export type {
  ProjectTeamContextSpaceSource,
  ProjectTeamContextState,
  ProjectTeamContextStarterFilesResult,
  ProjectTeamContextCreateSpaceResult,
} from './types/project-team-context.js';

export type {
  ProjectReviewSource,
  ProjectReviewState,
  ProjectReviewCreateResult,
  ProjectReviewDocument,
} from './types/project-review.js';

export type {
  ProjectBackgroundTaskStatus,
  ProjectBackgroundTaskSource,
  ProjectBackgroundTaskState,
  ProjectBackgroundTaskCreateResult,
  ProjectBackgroundTaskDocument,
} from './types/project-background-task.js';

export type {
  ProjectCheckpointSnapshotSession,
  ProjectCheckpointSnapshotInput,
  ProjectCheckpointSource,
  ProjectCheckpointRestoreMode,
  ProjectCheckpointState,
  ProjectCheckpointCreateResult,
  ProjectCheckpointDocument,
} from './types/project-checkpoint.js';

export type {
  CliSurfaceProfile,
  CliSurfacePortMode,
  CliSurfaceStartupTiming,
  CliSurfaceRuntimeState,
  CliSurfaceDiscoveryConfidence,
  CliSurfaceDiscoveryCandidate,
  CliSurfaceDiscoveryResult,
  CliSurfaceState,
  ProjectSurfaceRecord,
  SurfaceSelectionRange,
  SurfacePromptPayload,
} from './types/project-surface.js';

export type {
  ProjectRecord,
  Preferences,
  PersistedState,
} from './types/project-state.js';
