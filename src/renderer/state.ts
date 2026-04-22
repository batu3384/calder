import type { CalderApi } from './types.js';
import type { ProviderId } from '../shared/types/provider.js';
import type { SessionRecord, ArchivedSession, CostInfo, ContextWindowInfo, InitialContextSnapshot } from '../shared/types/session.js';
import type { ProjectGovernanceState } from '../shared/types/governance.js';
import type { ProjectRecord, Preferences, PersistedState, ProjectSurfaceRecord, ProjectContextState, ProjectWorkflowState, ProjectTeamContextState, ProjectReviewState, ProjectBackgroundTaskState, ProjectCheckpointState, ProjectCheckpointDocument, ProjectCheckpointRestoreMode, ProjectWorkflowDocument } from '../shared/types/project.js';
import { RendererPersistQueue } from './state-persistence.js';
import { RendererStateNavigation } from './state-navigation.js';
import { buildRendererPersistSnapshot } from './state-persist-snapshot.js';
import { migrateLoadedRendererState } from './state-load-migration.js';
import {
  collectSessionIdsForRemoval,
  resolveCycledSessionId,
  resolveSessionIdAtIndex,
} from './state-session-navigation.js';
import {
  applyProjectSurface,
  closeCliProjectSurface,
  closeMobileProjectSurface,
  focusCliProjectSurface,
  focusMobileProjectSurface,
} from './state-surface-updater.js';
import { findProjectForPath as findProjectRecordForPath } from './state-project-lookup.js';
import { setProjectDomainState } from './state-project-domain-updater.js';
import {
  normalizeProjectBackgroundTaskState,
  normalizeProjectCheckpointState,
  normalizeProjectContextState,
  normalizeProjectGovernanceState,
  normalizeProjectReviewState,
  normalizeProjectTeamContextState,
  normalizeProjectWorkflowState,
} from './state-normalizers.js';
import type { ProjectDomainStateKey } from './state-project-domain-updater.js';
import {
  addInsightSnapshotForProject,
  addPlanSessionInAppState,
  addMcpInspectorProjectSession,
  addRemoteProjectSession,
  addSessionInAppState,
  clearHistoryForProject,
  createProjectRecord,
  dismissInsightForProjectId,
  findProjectBySessionId,
  findSessionById,
  isInsightDismissedForProjectId,
  listSurfaceTargetSessionsForProject,
  openUrlInBrowserSurfaceInAppState,
  passivateBrowserTabSessionById,
  removeHistoryEntryForProject,
  removeProjectAndCollectSessions,
  removeSessionInAppState,
  renameSessionInAppState,
  reorderSessionForProject,
  resolveSurfaceTargetSessionForProject,
  resumeFromHistoryInAppState,
  resumeWithProviderInAppState,
  restoreProjectCheckpointInAppState,
  launchWorkflowSessionInAppState,
  setBrowserWidthRatioForProject,
  setMosaicRatioForProject,
  setActiveSessionInAppState,
  setSurfaceTargetSessionForProject,
  toggleHistoryBookmarkForProject,
  updateBrowserTabSessionUrlById,
  updateSessionCliIdInAppState,
  upsertBrowserTabProjectSession,
  upsertDiffViewerProjectSession,
  upsertFileReaderProjectSession,
} from './state-appstate-extracts.js';

export type { SessionRecord, ProjectRecord, Preferences, PersistedState, ArchivedSession } from '../shared/types.js';
export const MAX_SESSION_NAME_LENGTH = 60;

declare global {
  interface Window {
    calder: CalderApi;
  }
}

type EventType = 'project-added' | 'project-removed' | 'project-changed' | 'session-added' | 'session-removed'
  | 'session-changed' | 'layout-changed' | 'preferences-changed' | 'terminal-panel-changed' | 'history-changed'
  | 'insights-changed' | 'sidebar-toggled' | 'cli-session-cleared' | 'state-loaded';

type EventCallback = (data?: unknown) => void;
type SessionRemovalScope = 'all' | 'right' | 'left' | 'others';

const defaultPreferences: Preferences = {
  soundOnSessionWaiting: true, notificationsDesktop: true, debugMode: false, sessionHistoryEnabled: true,
  insightsEnabled: true, autoTitleEnabled: true,
  sidebarViews: { configSections: true, gitPanel: true, sessionHistory: true, costFooter: true },
};

const NAV_HISTORY_MAX = 50;

class AppState {
  private state: PersistedState = { version: 1, projects: [], activeProjectId: null, preferences: { ...defaultPreferences } };
  private listeners = new Map<EventType, Set<EventCallback>>();
  private navigation = new RendererStateNavigation(NAV_HISTORY_MAX);
  private persistQueue = new RendererPersistQueue(
    (snapshot) => window.calder.store.save(snapshot),
    (error) => { console.warn('Failed to persist renderer state:', error); },
  );

  private pushNav(sessionId: string | null | undefined): void {
    this.navigation.push(sessionId);
  }

  private pruneNav(sessionId: string): void {
    this.navigation.prune(sessionId);
  }

  findProjectForPath(inputPath: string | null | undefined): ProjectRecord | undefined {
    return findProjectRecordForPath(this.state.projects, inputPath);
  }

  navigateBack(): void {
    this.stepNav(-1);
  }

  navigateForward(): void {
    this.stepNav(1);
  }

  private stepNav(direction: 1 | -1): void {
    this.navigation.step(
      direction,
      (sessionId) => findProjectBySessionId(this.state.projects, sessionId),
      (project, sessionId) => {
        const projectChanged = this.state.activeProjectId !== project.id;
        this.state.activeProjectId = project.id;
        project.activeSessionId = sessionId;
        this.persist();
        if (projectChanged) this.emit('project-changed');
        this.emit('session-changed');
      },
    );
  }

  on(event: EventType, cb: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: EventType, data?: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  async load(): Promise<void> {
    const loaded = (await window.calder.store.load()) as PersistedState | null;
    let didMigrateState = false;
    if (loaded && loaded.version === 1) {
      const migration = migrateLoadedRendererState(loaded, defaultPreferences);
      this.state = migration.state;
      didMigrateState = migration.didMigrateState;
    }
    if (!this.state.starPromptDismissed) {
      this.state.appLaunchCount = (this.state.appLaunchCount ?? 0) + 1;
      this.persist();
    } else if (didMigrateState) {
      this.persist();
    }

    this.emit('state-loaded');
  }

  private persist(): void {
    this.persistQueue.enqueue(buildRendererPersistSnapshot(this.state));
  }

  get projects(): ProjectRecord[] {
    return this.state.projects;
  }
  get activeProjectId(): string | null {
    return this.state.activeProjectId;
  }
  get activeProject(): ProjectRecord | undefined {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId);
  }
  get activeSession(): SessionRecord | undefined {
    const project = this.activeProject;
    if (!project) return undefined;
    return project.sessions.find((s) => s.id === project.activeSessionId);
  }
  get sidebarWidth(): number | undefined {
    return this.state.sidebarWidth;
  }
  setSidebarWidth(width: number): void {
    this.state.sidebarWidth = width;
    this.persist();
  }
  get sidebarCollapsed(): boolean {
    return this.state.sidebarCollapsed ?? false;
  }
  toggleSidebar(): void {
    this.state.sidebarCollapsed = !this.sidebarCollapsed;
    this.persist();
    this.emit('sidebar-toggled');
  }
  setTerminalPanelOpen(open: boolean): void {
    const project = this.activeProject;
    if (!project) return;
    project.terminalPanelOpen = open;
    this.persist();
    this.emit('terminal-panel-changed');
  }
  setTerminalPanelHeight(height: number): void {
    const project = this.activeProject;
    if (!project) return;
    project.terminalPanelHeight = height;
    this.persist();
  }
  get lastSeenVersion(): string | undefined {
    return this.state.lastSeenVersion;
  }
  setLastSeenVersion(version: string): void {
    this.state.lastSeenVersion = version;
    this.persist();
  }
  get appLaunchCount(): number {
    return this.state.appLaunchCount ?? 0;
  }
  get starPromptDismissed(): boolean {
    return this.state.starPromptDismissed ?? false;
  }
  dismissStarPrompt(): void {
    this.state.starPromptDismissed = true;
    this.persist();
  }
  get preferences(): Preferences {
    return this.state.preferences;
  }
  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.state.preferences[key] = value;
    this.persist();
    this.emit('preferences-changed');
  }
  setActiveProject(id: string | null): void {
    this.state.activeProjectId = id;
    const project = this.state.projects.find((p) => p.id === id);
    if (project?.activeSessionId) this.pushNav(project.activeSessionId);
    this.persist();
    this.emit('project-changed');
  }

  private emitProjectChangedIfActive(project: ProjectRecord): void {
    if (project.id === this.state.activeProjectId) {
      this.emit('project-changed');
    }
  }

  private setProjectDomain<K extends ProjectDomainStateKey>(
    projectId: string,
    key: K,
    incoming: ProjectRecord[K],
    normalize: (
      incoming: NonNullable<ProjectRecord[K]>,
      previous: ProjectRecord[K],
    ) => ProjectRecord[K],
  ): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, key, incoming, normalize)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectContext(projectId: string, projectContext: ProjectContextState | undefined): void {
    this.setProjectDomain(projectId, 'projectContext', projectContext, normalizeProjectContextState);
  }

  setProjectWorkflows(projectId: string, projectWorkflows: ProjectWorkflowState | undefined): void {
    this.setProjectDomain(projectId, 'projectWorkflows', projectWorkflows, normalizeProjectWorkflowState);
  }

  setProjectTeamContext(projectId: string, projectTeamContext: ProjectTeamContextState | undefined): void {
    this.setProjectDomain(projectId, 'projectTeamContext', projectTeamContext, normalizeProjectTeamContextState);
  }

  setProjectReviews(projectId: string, projectReviews: ProjectReviewState | undefined): void {
    this.setProjectDomain(projectId, 'projectReviews', projectReviews, normalizeProjectReviewState);
  }

  setProjectGovernance(projectId: string, projectGovernance: ProjectGovernanceState | undefined): void {
    this.setProjectDomain(projectId, 'projectGovernance', projectGovernance, normalizeProjectGovernanceState);
  }

  setProjectBackgroundTasks(projectId: string, projectBackgroundTasks: ProjectBackgroundTaskState | undefined): void {
    this.setProjectDomain(projectId, 'projectBackgroundTasks', projectBackgroundTasks, normalizeProjectBackgroundTaskState);
  }

  setProjectCheckpoints(projectId: string, projectCheckpoints: ProjectCheckpointState | undefined): void {
    this.setProjectDomain(projectId, 'projectCheckpoints', projectCheckpoints, normalizeProjectCheckpointState);
  }

  restoreProjectCheckpoint(
    projectId: string,
    checkpoint: ProjectCheckpointDocument,
    mode: ProjectCheckpointRestoreMode = 'additive',
  ): void {
    restoreProjectCheckpointInAppState({
      projects: this.state.projects,
      projectId,
      checkpoint,
      mode,
      defaultProviderId: this.state.preferences.defaultProvider ?? 'claude',
      pruneNav: (sessionId) => this.pruneNav(sessionId),
      pushNav: (sessionId) => this.pushNav(sessionId),
      persist: () => this.persist(),
      onSessionRemoved: (sessionId) => this.emit('session-removed', { projectId, sessionId }),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onProjectChanged: () => this.emit('project-changed'),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  addProject(name: string, path: string): ProjectRecord {
    const project = createProjectRecord(name, path);
    this.state.projects.push(project);
    this.state.activeProjectId = project.id;
    this.persist();
    this.emit('project-added', project);
    this.emit('project-changed');
    return project;
  }

  removeProject(id: string): void {
    const sessions = removeProjectAndCollectSessions(this.state, id);
    this.persist();
    for (const session of sessions) {
      this.emit('session-removed', { projectId: id, sessionId: session.id });
    }
    this.emit('project-removed', id);
    this.emit('project-changed');
  }

  addPlanSession(projectId: string, name: string, providerOverride?: ProviderId): SessionRecord | undefined {
    return addPlanSessionInAppState({
      projects: this.state.projects,
      projectId,
      name,
      providerOverride,
      defaultProviderId: this.state.preferences.defaultProvider,
      pushNav: (sessionId) => this.pushNav(sessionId),
      persist: () => this.persist(),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  launchWorkflowSession(
    projectId: string,
    workflow: ProjectWorkflowDocument,
    providerOverride?: ProviderId,
  ): SessionRecord | undefined {
    return launchWorkflowSessionInAppState({
      projects: this.state.projects,
      projectId,
      workflow,
      providerOverride,
      defaultProviderId: this.state.preferences.defaultProvider,
      pushNav: (sessionId) => this.pushNav(sessionId),
      persist: () => this.persist(),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  addSession(projectId: string, name: string, args?: string, providerId?: ProviderId): SessionRecord | undefined {
    return addSessionInAppState({
      projects: this.state.projects,
      projectId,
      name,
      args,
      providerId,
      defaultProviderId: this.state.preferences.defaultProvider,
      pushNav: (sessionId) => this.pushNav(sessionId),
      persist: () => this.persist(),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  private addOrUpdateSession(
    projectId: string,
    run: (project: ProjectRecord) => { session: SessionRecord; created: boolean },
  ): SessionRecord | undefined {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return undefined;
    const result = run(project);
    this.persist();
    if (result.created) this.emit('session-added', { projectId, session: result.session });
    this.emit('session-changed');
    return result.session;
  }

  addDiffViewerSession(projectId: string, filePath: string, area: string, worktreePath?: string): SessionRecord | undefined {
    return this.addOrUpdateSession(projectId, (project) =>
      upsertDiffViewerProjectSession({
        project,
        filePath,
        area,
        worktreePath,
        pushNav: (sessionId) => this.pushNav(sessionId),
      }));
  }

  addRemoteSession(projectId: string, sessionId: string, hostSessionName: string, shareMode: 'readonly' | 'readwrite'): SessionRecord | undefined {
    return this.addOrUpdateSession(projectId, (project) => ({
      session: addRemoteProjectSession({
        project,
        sessionId,
        hostSessionName,
        shareMode,
        pushNav: (createdSessionId) => this.pushNav(createdSessionId),
      }),
      created: true,
    }));
  }

  addBrowserTabSession(
    projectId: string,
    url?: string,
    options?: { dedupeByUrl?: boolean },
  ): SessionRecord | undefined {
    return this.addOrUpdateSession(projectId, (project) =>
      upsertBrowserTabProjectSession({
        project,
        url,
        dedupeByUrl: options?.dedupeByUrl ?? true,
        pushNav: (sessionKey) => this.pushNav(sessionKey),
      }));
  }

  openUrlInBrowserSurface(projectId: string, url: string): SessionRecord | undefined {
    return openUrlInBrowserSurfaceInAppState({
      projects: this.state.projects,
      projectId,
      url,
      pushNav: (sessionId) => this.pushNav(sessionId),
      persist: () => this.persist(),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onProjectChanged: () => this.emit('project-changed'),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  addFileReaderSession(projectId: string, filePath: string, lineNumber?: number): SessionRecord | undefined {
    return this.addOrUpdateSession(projectId, (project) =>
      upsertFileReaderProjectSession({
        project,
        filePath,
        lineNumber,
        pushNav: (sessionId) => this.pushNav(sessionId),
      }));
  }

  addMcpInspectorSession(projectId: string, name: string): SessionRecord | undefined {
    return this.addOrUpdateSession(projectId, (project) => ({
      session: addMcpInspectorProjectSession({
        project,
        name,
        pushNav: (sessionId) => this.pushNav(sessionId),
      }),
      created: true,
    }));
  }

  removeSession(projectId: string, sessionId: string): void {
    removeSessionInAppState({
      projects: this.state.projects,
      projectId,
      sessionId,
      sessionHistoryEnabled: this.state.preferences.sessionHistoryEnabled,
      pruneNav: (navSessionId) => this.pruneNav(navSessionId),
      pushNav: (navSessionId) => this.pushNav(navSessionId),
      onHistoryChanged: (historyProjectId) => this.emit('history-changed', historyProjectId),
      persist: () => this.persist(),
      onSessionRemoved: () => this.emit('session-removed', { projectId, sessionId }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  getSessionHistory(projectId: string): ArchivedSession[] {
    const project = this.state.projects.find((p) => p.id === projectId);
    return project?.sessionHistory ?? [];
  }
  removeHistoryEntry(projectId: string, archivedSessionId: string): void {
    if (!removeHistoryEntryForProject(this.state.projects, projectId, archivedSessionId)) return;
    this.persist();
    this.emit('history-changed', projectId);
  }
  toggleBookmark(projectId: string, archivedSessionId: string): void {
    if (!toggleHistoryBookmarkForProject(this.state.projects, projectId, archivedSessionId)) return;
    this.persist();
    this.emit('history-changed', projectId);
  }
  clearSessionHistory(projectId: string): void {
    if (!clearHistoryForProject(this.state.projects, projectId)) return;
    this.persist();
    this.emit('history-changed', projectId);
  }
  resumeFromHistory(projectId: string, archivedSessionId: string): SessionRecord | undefined {
    return resumeFromHistoryInAppState({
      projects: this.state.projects,
      projectId,
      archivedSessionId,
      pushNav: (sessionId) => this.pushNav(sessionId),
      persist: () => this.persist(),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }
  async resumeWithProvider(
    projectId: string,
    source: { archivedSessionId?: string; sessionId?: string },
    targetProviderId: ProviderId,
  ): Promise<SessionRecord | undefined> {
    return resumeWithProviderInAppState({
      projects: this.state.projects,
      projectId,
      source,
      targetProviderId,
      buildResumePrompt: (sourceProviderId, sourceCliSessionId, projectPath, sourceName) =>
        window.calder.session.buildResumeWithPrompt(sourceProviderId, sourceCliSessionId, projectPath, sourceName),
      pushNav: (sessionId) => this.pushNav(sessionId),
      // persist() strips pendingInitialPrompt (transient). split-layout.onSessionAdded
      // will consume it synchronously from in-memory state before the next persist.
      persist: () => this.persist(),
      onSessionAdded: (session) => this.emit('session-added', { projectId, session }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }
  consumePendingInitialPrompt(projectId: string, sessionId: string): string | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    const session = project?.sessions.find((s) => s.id === sessionId);
    if (!session?.pendingInitialPrompt) return undefined;
    const prompt = session.pendingInitialPrompt;
    delete session.pendingInitialPrompt;
    return prompt;
  }
  setActiveSession(projectId: string, sessionId: string): void {
    setActiveSessionInAppState({
      projects: this.state.projects,
      projectId,
      sessionId,
      pushNav: (nextSessionId) => this.pushNav(nextSessionId),
      persist: () => this.persist(),
      onProjectChanged: () => this.emit('project-changed'),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }
  listBrowserTargetSessions(browserSessionId: string): SessionRecord[] {
    const project = findProjectBySessionId(this.state.projects, browserSessionId);
    return project ? this.listSurfaceTargetSessions(project.id) : [];
  }
  resolveBrowserTargetSession(browserSessionId: string): SessionRecord | undefined {
    const project = findProjectBySessionId(this.state.projects, browserSessionId);
    return project ? this.resolveSurfaceTargetSession(project.id) : undefined;
  }
  setBrowserTargetSession(browserSessionId: string, targetSessionId: string | null): void {
    const project = findProjectBySessionId(this.state.projects, browserSessionId);
    if (!project) return;
    this.setSurfaceTargetSession(project.id, targetSessionId);
  }

  setProjectSurface(projectId: string, surface: ProjectSurfaceRecord): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    // Contract guard: tabPlacement/tabOrder normalization is delegated to applyProjectSurface().
    applyProjectSurface(project, surface);
    this.persist();
    this.emit('project-changed');
  }

  private updateProjectSurface(
    projectId: string,
    mutate: (project: ProjectRecord) => boolean,
  ): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project || !mutate(project)) return;
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  focusCliSurfaceTab(projectId: string): void {
    this.updateProjectSurface(projectId, focusCliProjectSurface);
  }

  closeCliSurface(projectId: string): void {
    this.updateProjectSurface(projectId, closeCliProjectSurface);
  }

  focusMobileSurfaceTab(projectId: string): void {
    this.updateProjectSurface(projectId, focusMobileProjectSurface);
  }

  closeMobileSurface(projectId: string): void {
    this.updateProjectSurface(projectId, closeMobileProjectSurface);
  }

  listSurfaceTargetSessions(projectId: string): SessionRecord[] {
    return listSurfaceTargetSessionsForProject(this.state.projects, projectId);
  }

  resolveSurfaceTargetSession(
    projectId: string,
    options?: { requireExplicitTarget?: boolean },
  ): SessionRecord | undefined {
    return resolveSurfaceTargetSessionForProject({
      projects: this.state.projects,
      projectId,
      requireExplicitTarget: options?.requireExplicitTarget,
    });
  }

  setSurfaceTargetSession(projectId: string, targetSessionId: string | null): void {
    if (!setSurfaceTargetSessionForProject(this.state.projects, projectId, targetSessionId)) return;
    this.persist();
    this.emit('session-changed');
  }

  updateSessionCliId(projectId: string, sessionId: string, cliSessionId: string): void {
    updateSessionCliIdInAppState({
      projects: this.state.projects,
      projectId,
      sessionId,
      cliSessionId,
      onHistoryChanged: (historyProjectId) => this.emit('history-changed', historyProjectId),
      persist: () => this.persist(),
      onCliSessionCleared: () => this.emit('cli-session-cleared', { sessionId }),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  /** @deprecated Use updateSessionCliId */
  updateSessionClaudeId(projectId: string, sessionId: string, claudeSessionId: string): void {
    this.updateSessionCliId(projectId, sessionId, claudeSessionId);
  }

  hasSession(sessionId: string): boolean {
    return findSessionById(this.state.projects, sessionId) !== undefined;
  }

  updateSessionCost(sessionId: string, cost: CostInfo): void {
    const session = findSessionById(this.state.projects, sessionId);
    if (!session) return;
    session.cost = { ...cost };
    this.persist();
  }

  updateSessionContext(sessionId: string, context: ContextWindowInfo): void {
    const session = findSessionById(this.state.projects, sessionId);
    if (!session) return;
    session.contextWindow = { ...context };
    this.persist();
  }

  updateSessionBrowserTabUrl(sessionId: string, url: string): void {
    if (!updateBrowserTabSessionUrlById(this.state.projects, sessionId, url)) return;
    this.persist();
  }

  passivateBrowserTabSession(sessionId: string, failedUrl?: string): void {
    if (!passivateBrowserTabSessionById(this.state.projects, sessionId, failedUrl)) return;
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  renameSession(projectId: string, sessionId: string, name: string, userRenamed?: boolean): void {
    renameSessionInAppState({
      projects: this.state.projects,
      projectId,
      sessionId,
      name,
      userRenamed,
      maxSessionNameLength: MAX_SESSION_NAME_LENGTH,
      persist: () => this.persist(),
      onHistoryChanged: () => this.emit('history-changed', projectId),
      onSessionChanged: () => this.emit('session-changed'),
    });
  }

  setBrowserWidthRatio(projectId: string, ratio: number): void {
    if (!setBrowserWidthRatioForProject(this.state.projects, projectId, ratio)) return;
    this.persist();
    this.emit('layout-changed');
  }

  setMosaicRatio(projectId: string, key: string, ratio: number): void {
    if (!setMosaicRatioForProject(this.state.projects, projectId, key, ratio)) return;
    this.persist();
    this.emit('layout-changed');
  }

  cycleSession(direction: 1 | -1): void {
    const project = this.activeProject;
    if (!project) return;
    const nextSessionId = resolveCycledSessionId(project.sessions, project.activeSessionId, direction);
    if (!nextSessionId) return;
    project.activeSessionId = nextSessionId;
    this.pushNav(project.activeSessionId);
    this.persist();
    this.emit('session-changed');
  }
  gotoSession(index: number): void {
    const project = this.activeProject;
    if (!project) return;
    const nextSessionId = resolveSessionIdAtIndex(project.sessions, index);
    if (!nextSessionId) return;
    project.activeSessionId = nextSessionId;
    this.pushNav(project.activeSessionId);
    this.persist();
    this.emit('session-changed');
  }

  private removeSessionsByScope(projectId: string, scope: SessionRemovalScope, anchorSessionId?: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const ids = collectSessionIdsForRemoval(project.sessions, scope, anchorSessionId);
    for (const id of ids) this.removeSession(projectId, id);
  }

  removeAllSessions(projectId: string): void {
    this.removeSessionsByScope(projectId, 'all');
  }

  removeSessionsFromRight(projectId: string, sessionId: string): void {
    this.removeSessionsByScope(projectId, 'right', sessionId);
  }

  removeSessionsFromLeft(projectId: string, sessionId: string): void {
    this.removeSessionsByScope(projectId, 'left', sessionId);
  }

  removeOtherSessions(projectId: string, sessionId: string): void {
    this.removeSessionsByScope(projectId, 'others', sessionId);
  }

  addInsightSnapshot(projectId: string, snapshot: InitialContextSnapshot): void {
    if (!addInsightSnapshotForProject(this.state.projects, projectId, snapshot)) return;
    this.persist();
    this.emit('insights-changed', projectId);
  }

  dismissInsight(projectId: string, insightId: string): void {
    if (!dismissInsightForProjectId(this.state.projects, projectId, insightId)) return;
    this.persist();
    this.emit('insights-changed', projectId);
  }

  isInsightDismissed(projectId: string, insightId: string): boolean {
    return isInsightDismissedForProjectId(this.state.projects, projectId, insightId);
  }

  reorderSession(projectId: string, sessionId: string, toIndex: number): void {
    if (!reorderSessionForProject(this.state.projects, projectId, sessionId, toIndex)) return;
    this.persist();
    this.emit('session-changed');
  }

  /** @internal Test-only: reset all state containers */
  resetForTesting(): void {
    this.state = { version: 1, projects: [], activeProjectId: null, preferences: { ...defaultPreferences } };
    this.listeners = new Map();
    this.navigation.resetForTesting();
    this.persistQueue.resetForTesting();
  }
}

/** @internal Test-only: reset all module state */
export function _resetForTesting(): void {
  appState.resetForTesting();
}

export const appState = new AppState();
