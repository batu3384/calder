import { contextBridge, ipcRenderer } from 'electron';

import type {
  AutoApprovalMode,
  ProjectGovernanceStarterPolicyResult,
  ProjectGovernanceState,
} from '../shared/types/governance';
import type {
  MobileControlAnswerResult,
  MobileControlPairingResult,
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
  MobileDependencyInstallResult,
  MobileDependencyReport,
  MobileInspectInteractionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
  MobileInspectPointInspectionResult,
  MobileInspectScreenshotResult,
} from '../shared/types/mobile';
import type {
  ProjectBackgroundTaskCreateResult,
  ProjectBackgroundTaskDocument,
  ProjectBackgroundTaskState,
} from '../shared/types/project-background-task';
import type {
  ProjectCheckpointCreateResult,
  ProjectCheckpointDocument,
  ProjectCheckpointSnapshotInput,
  ProjectCheckpointState,
} from '../shared/types/project-checkpoint';
import type {
  ProjectContextCreateRuleResult,
  ProjectContextDeleteRuleResult,
  ProjectContextRenameRuleResult,
  ProjectContextStarterFilesResult,
  ProjectContextState,
} from '../shared/types/project-context';
import type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
  EmbeddedBrowserOpenPayload,
  ShareConnectionDescription,
  ShareRtcConfig,
} from '../shared/types/project-core';
import type {
  ProjectReviewCreateResult,
  ProjectReviewDocument,
  ProjectReviewState,
} from '../shared/types/project-review';
import type {
  CliSurfaceDiscoveryResult,
  CliSurfaceProfile,
  CliSurfaceRuntimeState,
} from '../shared/types/project-surface';
import type {
  ProjectTeamContextCreateSpaceResult,
  ProjectTeamContextStarterFilesResult,
  ProjectTeamContextState,
} from '../shared/types/project-team-context';
import type {
  ProjectWorkflowCreateResult,
  ProjectWorkflowDocument,
  ProjectWorkflowStarterFilesResult,
  ProjectWorkflowState,
} from '../shared/types/project-workflow';
import type {
  CliProviderMeta,
  ProviderConfig,
  ProviderId,
  ProviderUpdateCancelResult,
  ProviderUpdateProgressEvent,
  ProviderUpdateSummary,
  SettingsValidationResult,
  SettingsWarningData,
  StatusLineConflictData,
  UiLanguage,
} from '../shared/types/provider';
import type {
  CostData,
  InspectorEvent,
  StatsCache,
  ToolFailureData,
} from '../shared/types/session';
import { createPreloadCliSurfaceApi } from './preload-api-cli-surface.js';
import { createPreloadGitApi } from './preload-api-git.js';
import { createPreloadMcpApi } from './preload-api-mcp.js';
import {
  createPreloadMobileApi,
  createPreloadMobileInspectApi,
  createPreloadMobileSetupApi,
} from './preload-api-mobile.js';
import { createPreloadProjectDomainApi } from './preload-api-project-domains.js';
import { createPreloadProviderApi } from './preload-api-provider.js';
import { createPreloadPtyApi } from './preload-api-pty.js';

export type { CostData } from '../shared/types/session';

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
    /** @deprecated Use onCliSessionId instead */
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
    getConfig(providerId: ProviderId, projectPath: string): Promise<ProviderConfig>;
    getMeta(providerId: ProviderId): Promise<CliProviderMeta>;
    listProviders(): Promise<CliProviderMeta[]>;
    checkBinary(providerId?: ProviderId): Promise<{ ok: boolean; message: string }>;
    updateAll(): Promise<ProviderUpdateSummary>;
    updateProvider(providerId: ProviderId): Promise<ProviderUpdateSummary>;
    cancelUpdateAll(): Promise<ProviderUpdateCancelResult>;
    onUpdateProgress(callback: (event: ProviderUpdateProgressEvent) => void): () => void;
    watchProject(providerId: ProviderId, projectPath: string): void;
    onConfigChanged(callback: () => void): () => void;
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
  /** @deprecated Use provider namespace instead */
  claude: {
    getConfig(projectPath: string): Promise<ProviderConfig>;
  };
  git: {
    getStatus(path: string): Promise<unknown>;
    getFiles(path: string): Promise<unknown>;
    getDiff(path: string, file: string, area: string): Promise<string>;
    getWorktrees(path: string): Promise<unknown>;
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
  sharing: {
    getRtcConfig(): Promise<ShareRtcConfig>;
  };
  mobile: {
    createControlPairing(
      sessionId: string,
      offer: string,
      passphrase: string,
      mode: 'readonly' | 'readwrite',
      language?: UiLanguage,
      offerDescription?: ShareConnectionDescription,
    ): Promise<MobileControlPairingResult>;
    consumeControlAnswer(pairingId: string): Promise<MobileControlAnswerResult>;
    revokeControlPairing(pairingId: string): Promise<{ ok: boolean }>;
  };
  mobileSetup: {
    checkDependencies(): Promise<MobileDependencyReport>;
    installDependency(
      dependencyId: MobileDependencyId,
      installId?: string,
    ): Promise<MobileDependencyInstallResult>;
    onInstallProgress(callback: (event: MobileDependencyInstallProgressEvent) => void): () => void;
  };
  mobileInspect: {
    launch(platform: MobileInspectPlatform): Promise<MobileInspectLaunchResult>;
    captureScreenshot(platform: MobileInspectPlatform): Promise<MobileInspectScreenshotResult>;
    inspectPoint(
      platform: MobileInspectPlatform,
      x: number,
      y: number,
    ): Promise<MobileInspectPointInspectionResult>;
    interact(
      platform: MobileInspectPlatform,
      x: number,
      y: number,
    ): Promise<MobileInspectInteractionResult>;
  };
  cliSurface: {
    discover: (projectPath: string) => Promise<CliSurfaceDiscoveryResult>;
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
    connect(id: string, url: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
    disconnect(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
    listTools(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
    listResources(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
    listPrompts(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
    callTool(
      id: string,
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ success: boolean; data?: unknown; error?: string }>;
    readResource(
      id: string,
      uri: string,
    ): Promise<{ success: boolean; data?: unknown; error?: string }>;
    getPrompt(
      id: string,
      name: string,
      args: Record<string, string>,
    ): Promise<{ success: boolean; data?: unknown; error?: string }>;
    addServer(
      name: string,
      config: unknown,
      scope: 'user' | 'project',
      projectPath?: string,
    ): Promise<{ success: boolean; error?: string }>;
    removeServer(
      name: string,
      filePath: string,
      scope: 'user' | 'project',
      projectPath?: string,
    ): Promise<{ success: boolean; error?: string }>;
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

function onChannel(channel: string, callback: (...args: unknown[]) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: CalderApi = {
  pty: createPreloadPtyApi(ipcRenderer, onChannel),
  session: {
    buildResumeWithPrompt: (sourceProviderId, sourceCliSessionId, projectPath, sessionName) =>
      ipcRenderer.invoke(
        'session:buildResumeWithPrompt',
        sourceProviderId,
        sourceCliSessionId,
        projectPath,
        sessionName,
      ),
    onHookStatus: (callback) =>
      onChannel('session:hookStatus', (sessionId, status, hookName) =>
        callback(
          sessionId as string,
          status as 'working' | 'waiting' | 'completed' | 'input',
          (hookName as string) || '',
        ),
      ),
    onCliSessionId: (callback) =>
      onChannel('session:cliSessionId', (sessionId, cliSessionId) =>
        callback(sessionId as string, cliSessionId as string),
      ),
    onClaudeSessionId: (callback) =>
      onChannel('session:claudeSessionId', (sessionId, claudeSessionId) =>
        callback(sessionId as string, claudeSessionId as string),
      ),
    onCostData: (callback) =>
      onChannel('session:costData', (sessionId, costData) =>
        callback(sessionId as string, costData as CostData),
      ),
    onToolFailure: (callback) =>
      onChannel('session:toolFailure', (sessionId, data) =>
        callback(sessionId as string, data as ToolFailureData),
      ),
    onInspectorEvents: (callback) =>
      onChannel('session:inspectorEvents', (sessionId, events) =>
        callback(sessionId as string, events as InspectorEvent[]),
      ),
  },
  fs: {
    isDirectory: (path) => ipcRenderer.invoke('fs:isDirectory', path),
    expandPath: (path: string) => ipcRenderer.invoke('fs:expandPath', path),
    listDirs: (dirPath: string, prefix?: string) =>
      ipcRenderer.invoke('fs:listDirs', dirPath, prefix),
    browseDirectory: () => ipcRenderer.invoke('fs:browseDirectory'),
    listFiles: (cwd: string, query: string) => ipcRenderer.invoke('fs:listFiles', cwd, query),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    watchFile: (filePath: string) => ipcRenderer.send('fs:watchFile', filePath),
    unwatchFile: (filePath: string) => ipcRenderer.send('fs:unwatchFile', filePath),
    onFileChanged: (callback: (filePath: string) => void) =>
      onChannel('fs:fileChanged', (filePath) => callback(filePath as string)),
  },
  provider: createPreloadProviderApi(ipcRenderer, onChannel),
  ...createPreloadProjectDomainApi(ipcRenderer, onChannel),
  claude: {
    getConfig: (projectPath) => ipcRenderer.invoke('claude:getConfig', projectPath),
  },
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (state) => ipcRenderer.invoke('store:save', state),
  },
  git: createPreloadGitApi(ipcRenderer, onChannel),
  update: {
    checkNow: () => ipcRenderer.invoke('update:checkNow'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (cb) => onChannel('update:available', (info) => cb(info as { version: string })),
    onDownloadProgress: (cb) =>
      onChannel('update:download-progress', (info) => cb(info as { percent: number })),
    onDownloaded: (cb) => onChannel('update:downloaded', (info) => cb(info as { version: string })),
    onError: (cb) => onChannel('update:error', (info) => cb(info as { message: string })),
  },
  app: {
    focus: () => {
      ipcRenderer.send('app:focus');
    },
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    openExternal: (url: string, cwd?: string) => ipcRenderer.invoke('app:openExternal', url, cwd),
    getBrowserPreloadPath: () => ipcRenderer.invoke('app:getBrowserPreloadPath'),
    sendToGuestWebContents: (webContentsId: number, channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke('app:sendToGuestWebContents', webContentsId, channel, ...args),
    onOpenEmbeddedBrowserUrl: (cb: (payload: EmbeddedBrowserOpenPayload) => void) =>
      onChannel('app:openEmbeddedBrowserUrl', (payload) =>
        cb(payload as EmbeddedBrowserOpenPayload),
      ),
    onQuitting: (cb: () => void) => onChannel('app:quitting', cb),
  },
  browser: {
    saveScreenshot: (sessionId: string, dataUrl: string) =>
      ipcRenderer.invoke('browser:saveScreenshot', sessionId, dataUrl),
    listLocalTargets: () => ipcRenderer.invoke('browser:listLocalTargets'),
  },
  browserCredential: {
    listForUrl: (url: string) => ipcRenderer.invoke('browserCredential:listForUrl', url),
    saveForUrl: (input: BrowserCredentialSaveInput) =>
      ipcRenderer.invoke('browserCredential:saveForUrl', input),
    deleteById: (id: string) => ipcRenderer.invoke('browserCredential:deleteById', id),
    getForFill: (url: string, id: string) =>
      ipcRenderer.invoke('browserCredential:getForFill', url, id),
    getAutoFillForUrl: (url: string) =>
      ipcRenderer.invoke('browserCredential:getAutoFillForUrl', url),
  },
  sharing: {
    getRtcConfig: () => ipcRenderer.invoke('sharing:getRtcConfig'),
  },
  mobile: createPreloadMobileApi(ipcRenderer),
  mobileSetup: createPreloadMobileSetupApi(ipcRenderer, onChannel),
  mobileInspect: createPreloadMobileInspectApi(ipcRenderer),
  cliSurface: createPreloadCliSurfaceApi(ipcRenderer, onChannel),
  mcp: createPreloadMcpApi(ipcRenderer),
  stats: {
    getCache: () => ipcRenderer.invoke('stats:getCache'),
  },
  settings: {
    onWarning: (cb) => onChannel('settings:warning', (data) => cb(data as SettingsWarningData)),
    onConflictDialog: (cb) =>
      onChannel('settings:showConflictDialog', (data) => cb(data as StatusLineConflictData)),
    respondConflictDialog: (choice) => ipcRenderer.send('settings:conflictDialogResponse', choice),
    reinstall: (providerId) => ipcRenderer.invoke('settings:reinstall', providerId || 'claude'),
    validate: (providerId) => ipcRenderer.invoke('settings:validate', providerId || 'claude'),
  },
  menu: {
    onPreferences: (cb) => onChannel('menu:preferences', cb),
    onNewProject: (cb) => onChannel('menu:new-project', cb),
    onNewSession: (cb) => onChannel('menu:new-session', cb),
    onNextSession: (cb) => onChannel('menu:next-session', cb),
    onPrevSession: (cb) => onChannel('menu:prev-session', cb),
    onGotoSession: (cb) => onChannel('menu:goto-session', (index) => cb(index as number)),
    onToggleDebug: (cb) => onChannel('menu:toggle-debug', cb),
    onUsageStats: (cb) => onChannel('menu:usage-stats', cb),
    onProjectTerminal: (cb) => onChannel('menu:project-terminal', cb),
    onNewMcpInspector: (cb) => onChannel('menu:new-mcp-inspector', cb),
    onSessionIndicatorsHelp: (cb) => onChannel('menu:session-indicators-help', cb),
    onToggleInspector: (cb) => onChannel('menu:toggle-inspector', cb),
    onToggleContextPanel: (cb) => onChannel('menu:toggle-context-panel', cb),
    onCloseSession: (cb) => onChannel('menu:close-session', cb),
    rebuild: (debugMode) => ipcRenderer.invoke('menu:rebuild', debugMode),
  },
};

contextBridge.exposeInMainWorld('calder', api);
