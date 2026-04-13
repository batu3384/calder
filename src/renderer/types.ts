export type { McpServer, Agent, Skill, Command, ProviderConfig, ClaudeConfig, GitWorktree, GitFileEntry, CostData, McpResult, ProviderId, CliProviderMeta, CliProviderCapabilities, StatsCache, CliSurfaceProfile, CliSurfaceRuntimeState, CliSurfaceStartupTiming, CliSurfaceDiscoveryResult, ToolFailureData, SettingsWarningData, SettingsValidationResult, StatusLineConflictData, InspectorEvent, EmbeddedBrowserOpenPayload, ProjectContextState } from '../shared/types.js';
import type { CostData, ProviderConfig, GitWorktree, GitFileEntry, McpResult, ProviderId, CliProviderMeta, StatsCache, CliSurfaceProfile, CliSurfaceRuntimeState, CliSurfaceDiscoveryResult, ToolFailureData, SettingsWarningData, SettingsValidationResult, StatusLineConflictData, InspectorEvent, EmbeddedBrowserOpenPayload, ProjectContextState } from '../shared/types.js';

export interface CalderApi {
  pty: {
    create(sessionId: string, cwd: string, cliSessionId: string | null, isResume: boolean, extraArgs?: string, providerId?: ProviderId, initialPrompt?: string): Promise<void>;
    createShell(sessionId: string, cwd: string): Promise<void>;
    write(sessionId: string, data: string): void;
    resize(sessionId: string, cols: number, rows: number): void;
    kill(sessionId: string): Promise<void>;
    getCwd(sessionId: string): Promise<string | null>;
    onData(callback: (sessionId: string, data: string) => void): () => void;
    onExit(callback: (sessionId: string, exitCode: number, signal?: number) => void): () => void;
  };
  session: {
    buildResumeWithPrompt(sourceProviderId: ProviderId, sourceCliSessionId: string | null, projectPath: string, sessionName: string): Promise<string>;
    onHookStatus(callback: (sessionId: string, status: 'working' | 'waiting' | 'completed' | 'input', hookName: string) => void): () => void;
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
    readFile(filePath: string): Promise<string>;
    watchFile(filePath: string): void;
    unwatchFile(filePath: string): void;
    onFileChanged(callback: (filePath: string) => void): () => void;
  };
  store: {
    load(): Promise<unknown>;
    save(state: unknown): Promise<void>;
  };
  provider: {
    getConfig(providerId: ProviderId, projectPath: string): Promise<ProviderConfig>;
    getMeta(providerId: ProviderId): Promise<CliProviderMeta>;
    listProviders(): Promise<CliProviderMeta[]>;
    checkBinary(providerId?: ProviderId): Promise<{ ok: boolean; message: string }>;
    watchProject(providerId: ProviderId, projectPath: string): void;
    onConfigChanged(callback: () => void): () => void;
  };
  context: {
    getProjectState(projectPath: string): Promise<ProjectContextState>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectContextState) => void): () => void;
  };
  /** @deprecated Use provider namespace */
  claude: {
    getConfig(projectPath: string): Promise<ProviderConfig>;
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
    openExternal(url: string): Promise<void>;
    getBrowserPreloadPath(): Promise<string>;
    onOpenEmbeddedBrowserUrl(callback: (payload: EmbeddedBrowserOpenPayload) => void): () => void;
    onQuitting(callback: () => void): () => void;
  };
  browser: {
    saveScreenshot(sessionId: string, dataUrl: string): Promise<string>;
    listLocalTargets(): Promise<Array<{ url: string; label: string; meta: string }>>;
  };
  cliSurface: {
    discover(projectPath: string): Promise<CliSurfaceDiscoveryResult>;
    start(projectId: string, profile: CliSurfaceProfile): Promise<void>;
    stop(projectId: string): Promise<void>;
    restart(projectId: string): Promise<void>;
    write(projectId: string, data: string): void;
    resize(projectId: string, cols: number, rows: number): void;
    onData(callback: (projectId: string, data: string) => void): () => void;
    onExit(callback: (projectId: string, exitCode: number, signal?: number) => void): () => void;
    onStatus(callback: (projectId: string, state: CliSurfaceRuntimeState) => void): () => void;
    onError(callback: (projectId: string, message: string) => void): () => void;
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
    addServer(name: string, config: unknown, scope: 'user' | 'project', projectPath?: string): Promise<McpResult>;
    removeServer(name: string, filePath: string, scope: 'user' | 'project', projectPath?: string): Promise<McpResult>;
  };
  stats: {
    getCache(): Promise<StatsCache | null>;
  };
  settings: {
    onWarning(callback: (data: SettingsWarningData) => void): () => void;
    onConflictDialog(callback: (data: StatusLineConflictData) => void): () => void;
    respondConflictDialog(choice: 'replace' | 'keep'): void;
    reinstall(providerId?: ProviderId): Promise<{ success: boolean }>;
    validate(providerId?: ProviderId): Promise<SettingsValidationResult>;
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
