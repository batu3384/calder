export type {
  AutoApprovalMode,
  AutoApprovalPolicySource,
  ProjectGovernanceAutoApprovalState,
  ProjectGovernanceStarterPolicyResult,
  ProjectGovernanceState,
} from '../shared/types/governance.js';
export type {
  ProjectBackgroundTaskCreateResult,
  ProjectBackgroundTaskDocument,
  ProjectBackgroundTaskState,
} from '../shared/types/project-background-task.js';
export type {
  ProjectCheckpointCreateResult,
  ProjectCheckpointDocument,
  ProjectCheckpointSnapshotInput,
  ProjectCheckpointState,
} from '../shared/types/project-checkpoint.js';
export type {
  ProjectContextCreateRuleResult,
  ProjectContextDeleteRuleResult,
  ProjectContextRenameRuleResult,
  ProjectContextStarterFilesResult,
  ProjectContextState,
} from '../shared/types/project-context.js';
export type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
  EmbeddedBrowserOpenPayload,
  GitFileEntry,
  GitWorktree,
  McpResult,
} from '../shared/types/project-core.js';
export type {
  ProjectReviewCreateResult,
  ProjectReviewDocument,
  ProjectReviewState,
} from '../shared/types/project-review.js';
export type {
  ProjectTeamContextCreateSpaceResult,
  ProjectTeamContextStarterFilesResult,
  ProjectTeamContextState,
} from '../shared/types/project-team-context.js';
export type {
  ProjectWorkflowCreateResult,
  ProjectWorkflowDocument,
  ProjectWorkflowStarterFilesResult,
  ProjectWorkflowState,
} from '../shared/types/project-workflow.js';
export type {
  CliProviderCapabilities,
  CliProviderMeta,
  ProviderId,
  ProviderUpdateCancelResult,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSummary,
  UiLanguage,
} from '../shared/types/provider.js';
export type {
  CostData,
  InspectorEvent,
  StatsCache,
  ToolFailureData,
} from '../shared/types/session.js';
import type {
  AutoApprovalMode,
  ProjectGovernanceStarterPolicyResult,
  ProjectGovernanceState,
} from '../shared/types/governance.js';
import type {
  ProjectBackgroundTaskCreateResult,
  ProjectBackgroundTaskDocument,
  ProjectBackgroundTaskState,
} from '../shared/types/project-background-task.js';
import type {
  ProjectCheckpointCreateResult,
  ProjectCheckpointDocument,
  ProjectCheckpointSnapshotInput,
  ProjectCheckpointState,
} from '../shared/types/project-checkpoint.js';
import type {
  ProjectContextCreateRuleResult,
  ProjectContextDeleteRuleResult,
  ProjectContextRenameRuleResult,
  ProjectContextStarterFilesResult,
  ProjectContextState,
} from '../shared/types/project-context.js';
import type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
  EmbeddedBrowserOpenPayload,
  GitFileEntry,
  GitWorktree,
  McpResult,
} from '../shared/types/project-core.js';
import type {
  ProjectReviewCreateResult,
  ProjectReviewDocument,
  ProjectReviewState,
} from '../shared/types/project-review.js';
import type {
  ProjectTeamContextCreateSpaceResult,
  ProjectTeamContextStarterFilesResult,
  ProjectTeamContextState,
} from '../shared/types/project-team-context.js';
import type {
  ProjectWorkflowCreateResult,
  ProjectWorkflowDocument,
  ProjectWorkflowStarterFilesResult,
  ProjectWorkflowState,
} from '../shared/types/project-workflow.js';
import type {
  CliProviderMeta,
  ProviderId,
  ProviderUpdateCancelResult,
  ProviderUpdateProgressEvent,
  ProviderUpdateSummary,
} from '../shared/types/provider.js';
import type {
  CostData,
  InspectorEvent,
  StatsCache,
  ToolFailureData,
} from '../shared/types/session.js';
import type {
  EvidenceEvent,
  EvidenceHealth,
  EvidenceReview,
  EvidenceReviewStatus,
  EvidenceRunMeta,
  EvidenceSettings,
  EvidenceSummary,
} from '../shared/types-evidence.js';

export interface CalderApi {
  pty: {
    create(
      sessionId: string,
      cwd: string,
      cliSessionId: string | null,
      isResume: boolean,
      extraArgs?: string,
      providerId?: ProviderId,
      initialPrompt?: string,
    ): Promise<void>;
    createShell(sessionId: string, cwd: string): Promise<void>;
    write(sessionId: string, data: string): void;
    resize(sessionId: string, cols: number, rows: number): void;
    kill(sessionId: string): Promise<void>;
    getCwd(sessionId: string): Promise<string | null>;
    onData(callback: (sessionId: string, data: string) => void): () => void;
    onExit(callback: (sessionId: string, exitCode: number, signal?: number) => void): () => void;
  };
  session: {
    buildResumeWithPrompt(
      sourceProviderId: ProviderId,
      sourceCliSessionId: string | null,
      projectPath: string,
      sessionName: string,
    ): Promise<string>;
    onHookStatus(
      callback: (
        sessionId: string,
        status: 'working' | 'waiting' | 'completed' | 'input',
        hookName: string,
      ) => void,
    ): () => void;
    onCliSessionId(callback: (sessionId: string, cliSessionId: string) => void): () => void;
    /** @deprecated Use onCliSessionId */
    onClaudeSessionId(callback: (sessionId: string, claudeSessionId: string) => void): () => void;
    onCostData(callback: (sessionId: string, costData: CostData) => void): () => void;
    onToolFailure(callback: (sessionId: string, data: ToolFailureData) => void): () => void;
    onInspectorEvents(callback: (sessionId: string, events: InspectorEvent[]) => void): () => void;
  };
  fs: {
    isDirectory(path: string): Promise<boolean>;
    expandPath(path: string): Promise<string>;
    listDirs(dirPath: string, prefix?: string): Promise<string[]>;
    browseDirectory(): Promise<string | null>;
    listFiles(cwd: string, query: string): Promise<string[]>;
    readFile(filePath: string): Promise<import('../shared/types/fs-read').FsReadFileResult>;
    watchFile(filePath: string): void;
    unwatchFile(filePath: string): void;
    onFileChanged(callback: (filePath: string) => void): () => void;
  };
  store: {
    load(): Promise<unknown>;
    save(state: unknown): Promise<void>;
  };
  provider: {
    getMeta(providerId: ProviderId): Promise<CliProviderMeta>;
    listProviders(): Promise<CliProviderMeta[]>;
    checkBinary(providerId?: ProviderId): Promise<{ ok: boolean; message: string }>;
    updateAll(): Promise<ProviderUpdateSummary>;
    updateProvider(providerId: ProviderId): Promise<ProviderUpdateSummary>;
    installProvider(providerId: ProviderId): Promise<ProviderUpdateSummary>;
    cancelUpdateAll(): Promise<ProviderUpdateCancelResult>;
    onUpdateProgress(callback: (event: ProviderUpdateProgressEvent) => void): () => void;
  };
  context: {
    getProjectState(projectPath: string): Promise<ProjectContextState>;
    createStarterFiles(projectPath: string): Promise<ProjectContextStarterFilesResult>;
    createSharedRule(
      projectPath: string,
      title: string,
      priority: 'hard' | 'soft',
    ): Promise<ProjectContextCreateRuleResult>;
    renameSharedRule(
      projectPath: string,
      relativePath: string,
      title: string,
      priority: 'hard' | 'soft',
    ): Promise<ProjectContextRenameRuleResult>;
    deleteSharedRule(
      projectPath: string,
      relativePath: string,
    ): Promise<ProjectContextDeleteRuleResult>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectContextState) => void): () => void;
  };
  workflow: {
    getProjectState(projectPath: string): Promise<ProjectWorkflowState>;
    createStarterFiles(projectPath: string): Promise<ProjectWorkflowStarterFilesResult>;
    createFile(projectPath: string, title: string): Promise<ProjectWorkflowCreateResult>;
    readFile(projectPath: string, workflowPath: string): Promise<ProjectWorkflowDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectWorkflowState) => void): () => void;
  };
  teamContext: {
    getProjectState(projectPath: string): Promise<ProjectTeamContextState>;
    createStarterFiles(projectPath: string): Promise<ProjectTeamContextStarterFilesResult>;
    createSpace(projectPath: string, title: string): Promise<ProjectTeamContextCreateSpaceResult>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectTeamContextState) => void): () => void;
  };
  review: {
    getProjectState(projectPath: string): Promise<ProjectReviewState>;
    createFile(projectPath: string, title: string): Promise<ProjectReviewCreateResult>;
    readFile(projectPath: string, reviewPath: string): Promise<ProjectReviewDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectReviewState) => void): () => void;
  };
  governance: {
    getProjectState(projectPath: string, sessionId?: string): Promise<ProjectGovernanceState>;
    setAutoApprovalMode(
      projectPath: string,
      scope: 'global' | 'project',
      mode: AutoApprovalMode | null,
      sessionId?: string,
    ): Promise<ProjectGovernanceState>;
    setSessionAutoApprovalOverride(
      sessionId: string,
      mode: AutoApprovalMode | null,
    ): Promise<{ ok: boolean }>;
    createStarterPolicy(projectPath: string): Promise<ProjectGovernanceStarterPolicyResult>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectGovernanceState) => void): () => void;
  };
  task: {
    getProjectState(projectPath: string): Promise<ProjectBackgroundTaskState>;
    create(
      projectPath: string,
      title: string,
      prompt: string,
    ): Promise<ProjectBackgroundTaskCreateResult>;
    read(projectPath: string, taskPath: string): Promise<ProjectBackgroundTaskDocument>;
    watchProject(projectPath: string): void;
    onChanged(
      callback: (projectPath: string, state: ProjectBackgroundTaskState) => void,
    ): () => void;
  };
  checkpoint: {
    getProjectState(projectPath: string): Promise<ProjectCheckpointState>;
    create(
      projectPath: string,
      snapshot: ProjectCheckpointSnapshotInput,
    ): Promise<ProjectCheckpointCreateResult>;
    read(projectPath: string, checkpointPath: string): Promise<ProjectCheckpointDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectCheckpointState) => void): () => void;
  };
  git: {
    getStatus(path: string): Promise<unknown>;
    getFiles(path: string): Promise<GitFileEntry[]>;
    getDiff(path: string, file: string, area: string): Promise<string>;
    getWorktrees(path: string): Promise<GitWorktree[]>;
    getRemoteUrl(path: string): Promise<string | null>;
    stageFile(path: string, file: string): Promise<void>;
    unstageFile(path: string, file: string): Promise<void>;
    discardFile(path: string, file: string, area: string): Promise<void>;
    openInEditor(path: string, file: string): Promise<void>;
    listBranches(path: string): Promise<{ name: string; current: boolean }[]>;
    checkoutBranch(path: string, branch: string): Promise<void>;
    createBranch(path: string, branch: string): Promise<void>;
    watchProject(path: string): void;
    onChanged(callback: () => void): () => void;
  };
  update: {
    checkNow(): Promise<void>;
    install(): Promise<void>;
    onAvailable(cb: (info: { version: string }) => void): () => void;
    onDownloadProgress(cb: (info: { percent: number }) => void): () => void;
    onDownloaded(cb: (info: { version: string }) => void): () => void;
    onError(cb: (info: { message: string }) => void): () => void;
  };
  app: {
    focus(): void;
    getVersion(): Promise<string>;
    openExternal(url: string, cwd?: string): Promise<void>;
    getBrowserPreloadPath(): Promise<string>;
    sendToGuestWebContents(
      webContentsId: number,
      channel: string,
      ...args: unknown[]
    ): Promise<boolean>;
    onOpenEmbeddedBrowserUrl(callback: (payload: EmbeddedBrowserOpenPayload) => void): () => void;
    onQuitting(callback: () => void): () => void;
  };
  browser: {
    saveScreenshot(sessionId: string, dataUrl: string): Promise<string>;
    listLocalTargets(): Promise<Array<{ url: string; label: string; meta: string }>>;
  };
  browserCredential: {
    listForUrl(url: string): Promise<BrowserCredentialSummary[]>;
    saveForUrl(input: BrowserCredentialSaveInput): Promise<BrowserCredentialSummary>;
    deleteById(id: string): Promise<{ deleted: boolean }>;
    getForFill(url: string, id: string): Promise<BrowserCredentialFillData | null>;
    getAutoFillForUrl(url: string): Promise<BrowserCredentialFillData | null>;
  };
  mcp: {
    connect(id: string, url: string): Promise<McpResult>;
    disconnect(id: string): Promise<McpResult>;
    listTools(id: string): Promise<McpResult>;
    listResources(id: string): Promise<McpResult>;
    listPrompts(id: string): Promise<McpResult>;
    callTool(id: string, name: string, args: Record<string, unknown>): Promise<McpResult>;
    readResource(id: string, uri: string): Promise<McpResult>;
    getPrompt(id: string, name: string, args: Record<string, string>): Promise<McpResult>;
  };
  stats: {
    getCache(): Promise<StatsCache | null>;
  };
  evidence: {
    getSummary(id: string): Promise<{
      summary: EvidenceSummary | null;
      summaryStale: boolean;
      coverage: EvidenceSummary['coverage'];
      gaps: EvidenceHealth['gaps'];
      runId: string;
    } | null>;
    listEvents(
      id: string,
      offset?: number,
      limit?: number,
    ): Promise<{ runId: string | null; events: EvidenceEvent[]; total: number }>;
    getHealth(id: string): Promise<EvidenceHealth | null>;
    getMeta(id: string): Promise<EvidenceRunMeta | null>;
    updateReview(
      runId: string,
      status: EvidenceReviewStatus,
      notes?: string,
    ): Promise<EvidenceReview>;
    export(
      runId: string,
      format: 'json' | 'markdown',
    ): Promise<{ canceled: true } | { canceled: false; filePath: string }>;
    deleteRun(runId: string): Promise<{ ok: boolean }>;
    deleteAll(): Promise<{ canceled: boolean }>;
    getSettings(): Promise<EvidenceSettings>;
    setSettings(settings: EvidenceSettings): Promise<EvidenceSettings>;
    getStorageUsage(): Promise<number>;
    rebuildSummary(runId: string): Promise<EvidenceSummary | null>;
    resolveRunId(sessionId: string): Promise<string | null>;
    subscribe(runId: string): void;
    unsubscribe(): void;
    onEvent(callback: (runId: string, events: EvidenceEvent[]) => void): () => void;
  };
  menu: {
    onPreferences(callback: () => void): () => void;
    onNewProject(callback: () => void): () => void;
    onNewSession(callback: () => void): () => void;
    onNextSession(callback: () => void): () => void;
    onPrevSession(callback: () => void): () => void;
    onGotoSession(callback: (index: number) => void): () => void;
    onToggleDebug(callback: () => void): () => void;
    onUsageStats(callback: () => void): () => void;
    onProjectTerminal(callback: () => void): () => void;
    onNewMcpInspector(callback: () => void): () => void;
    onSessionIndicatorsHelp(callback: () => void): () => void;
    onToggleInspector(callback: () => void): () => void;
    onToggleContextPanel(callback: () => void): () => void;
    onCloseSession(callback: () => void): () => void;
    rebuild(debugMode: boolean): Promise<void>;
  };
}
