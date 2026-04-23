import type { CalderApi } from './types.js';
import type { ProviderId } from '../shared/types/provider.js';
import type { SessionRecord, ArchivedSession, CostInfo, ContextWindowInfo, InitialContextSnapshot } from '../shared/types/session.js';
import type { ProjectGovernanceState } from '../shared/types/governance.js';
import type { ProjectRecord, Preferences, PersistedState } from '../shared/types/project-state.js';
import type { ProjectSurfaceRecord } from '../shared/types/project-surface.js';
import type { ProjectContextState } from '../shared/types/project-context.js';
import type { ProjectWorkflowState, ProjectWorkflowDocument } from '../shared/types/project-workflow.js';
import type { ProjectTeamContextState } from '../shared/types/project-team-context.js';
import type { ProjectReviewState } from '../shared/types/project-review.js';
import type { ProjectBackgroundTaskState } from '../shared/types/project-background-task.js';
import type { ProjectCheckpointState, ProjectCheckpointDocument, ProjectCheckpointRestoreMode } from '../shared/types/project-checkpoint.js';
import { RendererPersistQueue } from './state-persistence.js';
import { RendererStateNavigation } from './state-navigation.js';
import { buildRendererPersistSnapshot } from './state-persist-snapshot.js';
import { migrateLoadedRendererState } from './state-load-migration.js';
import { defaultPreferences, type EventCallback, type EventType, NAV_HISTORY_MAX, type SessionRemovalScope } from './state/state-contracts.js';
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
  clearHistoryForProject,
  findProjectBySessionId,
  findSessionById,
  isInsightDismissedInAppState,
  listSurfaceTargetSessionsForProject,
  removeHistoryEntryForProject,
  resolveSurfaceTargetSessionForProject,
  toggleHistoryBookmarkForProject,
} from './state-appstate-extracts.js';
import { addProjectToState, collectProjectSessionIdsForScope, consumePendingInitialPromptFromState, cycleActiveProjectSession, gotoProjectSession, removeProjectFromState } from './state/state-project-session-helpers.js';
import type { AppStateRuntimeBridge } from './state/state-appstate-runtime-bridge.js';
import {
  addBrowserTabSessionWithBridge,
  addDiffViewerSessionWithBridge,
  addInsightSnapshotWithBridge,
  addFileReaderSessionWithBridge,
  addMcpInspectorSessionWithBridge,
  addPlanSessionWithBridge,
  addRemoteSessionWithBridge,
  addSessionWithBridge,
  dismissInsightWithBridge,
  launchWorkflowSessionWithBridge,
  openUrlInBrowserSurfaceWithBridge,
  passivateBrowserTabSessionWithBridge,
  removeSessionWithBridge,
  renameSessionWithBridge,
  reorderSessionWithBridge,
  resumeFromHistoryWithBridge,
  resumeWithProviderWithBridge,
  restoreProjectCheckpointWithBridge,
  setActiveSessionWithBridge,
  setBrowserWidthRatioWithBridge,
  setMosaicRatioWithBridge,
  setSurfaceTargetSessionWithBridge,
  updateSessionBrowserTabUrlWithBridge,
  updateSessionCliIdWithBridge,
  updateSessionContextWithBridge,
  updateSessionCostWithBridge,
} from './state/state-appstate-runtime-bridge.js';

export type { SessionRecord, ArchivedSession } from '../shared/types/session.js';
export type { ProjectRecord, Preferences, PersistedState } from '../shared/types/project-state.js';
export const MAX_SESSION_NAME_LENGTH = 60;

declare global {
  interface Window {
    calder: CalderApi;
  }
}

class AppState {
  private state: PersistedState = { version: 1, projects: [], activeProjectId: null, preferences: { ...defaultPreferences } };
  private listeners = new Map<EventType, Set<EventCallback>>();
  private navigation = new RendererStateNavigation(NAV_HISTORY_MAX);
  private persistQueue = new RendererPersistQueue(
    (snapshot) => window.calder.store.save(snapshot),
    (error) => { console.warn('Failed to persist renderer state:', error); },
  );

  private pushNav(sessionId: string | null | undefined): void { this.navigation.push(sessionId); }
  private pruneNav(sessionId: string): void { this.navigation.prune(sessionId); }

  findProjectForPath(inputPath: string | null | undefined): ProjectRecord | undefined {
    return findProjectRecordForPath(this.state.projects, inputPath);
  }

  navigateBack(): void { this.stepNav(-1); }
  navigateForward(): void { this.stepNav(1); }

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
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
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
  get activeProjectId(): string | null { return this.state.activeProjectId; }
  get activeProject(): ProjectRecord | undefined {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId);
  }
  get activeSession(): SessionRecord | undefined {
    const project = this.activeProject;
    if (!project) return undefined;
    return project.sessions.find((s) => s.id === project.activeSessionId);
  }
  get sidebarWidth(): number | undefined { return this.state.sidebarWidth; }
  setSidebarWidth(width: number): void {
    this.state.sidebarWidth = width;
    this.persist();
  }
  get sidebarCollapsed(): boolean { return this.state.sidebarCollapsed ?? false; }
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
  get lastSeenVersion(): string | undefined { return this.state.lastSeenVersion; }
  setLastSeenVersion(version: string): void {
    this.state.lastSeenVersion = version;
    this.persist();
  }
  get appLaunchCount(): number { return this.state.appLaunchCount ?? 0; }
  get starPromptDismissed(): boolean { return this.state.starPromptDismissed ?? false; }
  dismissStarPrompt(): void {
    this.state.starPromptDismissed = true;
    this.persist();
  }
  get preferences(): Preferences { return this.state.preferences; }
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
    if (project.id === this.state.activeProjectId) this.emit('project-changed');
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

  private runtimeBridge(): AppStateRuntimeBridge {
    return {
      projects: this.state.projects,
      defaultProviderId: this.state.preferences.defaultProvider,
      sessionHistoryEnabled: this.state.preferences.sessionHistoryEnabled,
      pushNav: (sessionId) => this.pushNav(sessionId),
      pruneNav: (sessionId) => this.pruneNav(sessionId),
      persist: () => this.persist(),
      emit: (event, data) => this.emit(event, data),
      buildResumePrompt: (sourceProviderId, sourceCliSessionId, projectPath, sourceName) =>
        window.calder.session.buildResumeWithPrompt(sourceProviderId, sourceCliSessionId, projectPath, sourceName),
    };
  }

  setProjectContext(projectId: string, projectContext: ProjectContextState | undefined): void { this.setProjectDomain(projectId, 'projectContext', projectContext, normalizeProjectContextState); }
  setProjectWorkflows(projectId: string, projectWorkflows: ProjectWorkflowState | undefined): void { this.setProjectDomain(projectId, 'projectWorkflows', projectWorkflows, normalizeProjectWorkflowState); }
  setProjectTeamContext(projectId: string, projectTeamContext: ProjectTeamContextState | undefined): void { this.setProjectDomain(projectId, 'projectTeamContext', projectTeamContext, normalizeProjectTeamContextState); }
  setProjectReviews(projectId: string, projectReviews: ProjectReviewState | undefined): void { this.setProjectDomain(projectId, 'projectReviews', projectReviews, normalizeProjectReviewState); }
  setProjectGovernance(projectId: string, projectGovernance: ProjectGovernanceState | undefined): void { this.setProjectDomain(projectId, 'projectGovernance', projectGovernance, normalizeProjectGovernanceState); }
  setProjectBackgroundTasks(projectId: string, projectBackgroundTasks: ProjectBackgroundTaskState | undefined): void { this.setProjectDomain(projectId, 'projectBackgroundTasks', projectBackgroundTasks, normalizeProjectBackgroundTaskState); }
  setProjectCheckpoints(projectId: string, projectCheckpoints: ProjectCheckpointState | undefined): void { this.setProjectDomain(projectId, 'projectCheckpoints', projectCheckpoints, normalizeProjectCheckpointState); }

  restoreProjectCheckpoint(
    projectId: string,
    checkpoint: ProjectCheckpointDocument,
    mode: ProjectCheckpointRestoreMode = 'additive',
  ): void {
    restoreProjectCheckpointWithBridge(this.runtimeBridge(), projectId, checkpoint, mode);
  }

  addProject(name: string, path: string): ProjectRecord {
    const project = addProjectToState(this.state, name, path);
    this.persist(); this.emit('project-added', project); this.emit('project-changed');
    return project;
  }

  removeProject(id: string): void {
    const sessions = removeProjectFromState(this.state, id);
    this.persist();
    for (const session of sessions) this.emit('session-removed', { projectId: id, sessionId: session.id });
    this.emit('project-removed', id); this.emit('project-changed');
  }

  addPlanSession(projectId: string, name: string, providerOverride?: ProviderId): SessionRecord | undefined { return addPlanSessionWithBridge(this.runtimeBridge(), projectId, name, providerOverride); }
  launchWorkflowSession(projectId: string, workflow: ProjectWorkflowDocument, providerOverride?: ProviderId): SessionRecord | undefined { return launchWorkflowSessionWithBridge(this.runtimeBridge(), projectId, workflow, providerOverride); }
  addSession(projectId: string, name: string, args?: string, providerId?: ProviderId): SessionRecord | undefined { return addSessionWithBridge(this.runtimeBridge(), projectId, name, args, providerId); }

  addDiffViewerSession(projectId: string, filePath: string, area: string, worktreePath?: string): SessionRecord | undefined {
    return addDiffViewerSessionWithBridge(this.runtimeBridge(), projectId, filePath, area, worktreePath);
  }

  addRemoteSession(projectId: string, sessionId: string, hostSessionName: string, shareMode: 'readonly' | 'readwrite'): SessionRecord | undefined {
    return addRemoteSessionWithBridge(this.runtimeBridge(), projectId, sessionId, hostSessionName, shareMode);
  }

  addBrowserTabSession(projectId: string, url?: string, options?: { dedupeByUrl?: boolean }): SessionRecord | undefined {
    return addBrowserTabSessionWithBridge(this.runtimeBridge(), projectId, url, options?.dedupeByUrl ?? true);
  }

  openUrlInBrowserSurface(projectId: string, url: string): SessionRecord | undefined {
    return openUrlInBrowserSurfaceWithBridge(this.runtimeBridge(), projectId, url);
  }

  addFileReaderSession(projectId: string, filePath: string, lineNumber?: number): SessionRecord | undefined {
    return addFileReaderSessionWithBridge(this.runtimeBridge(), projectId, filePath, lineNumber);
  }

  addMcpInspectorSession(projectId: string, name: string): SessionRecord | undefined {
    return addMcpInspectorSessionWithBridge(this.runtimeBridge(), projectId, name);
  }

  removeSession(projectId: string, sessionId: string): void {
    removeSessionWithBridge(this.runtimeBridge(), projectId, sessionId);
  }

  getSessionHistory(projectId: string): ArchivedSession[] {
    const project = this.state.projects.find((p) => p.id === projectId);
    return project?.sessionHistory ?? [];
  }
  removeHistoryEntry(projectId: string, archivedSessionId: string): void {
    if (!removeHistoryEntryForProject(this.state.projects, projectId, archivedSessionId)) return;
    this.persist(); this.emit('history-changed', projectId);
  }
  toggleBookmark(projectId: string, archivedSessionId: string): void {
    if (!toggleHistoryBookmarkForProject(this.state.projects, projectId, archivedSessionId)) return;
    this.persist(); this.emit('history-changed', projectId);
  }
  clearSessionHistory(projectId: string): void {
    if (!clearHistoryForProject(this.state.projects, projectId)) return;
    this.persist(); this.emit('history-changed', projectId);
  }
  resumeFromHistory(projectId: string, archivedSessionId: string): SessionRecord | undefined {
    return resumeFromHistoryWithBridge(this.runtimeBridge(), projectId, archivedSessionId);
  }
  async resumeWithProvider(
    projectId: string,
    source: { archivedSessionId?: string; sessionId?: string },
    targetProviderId: ProviderId,
  ): Promise<SessionRecord | undefined> {
    return resumeWithProviderWithBridge(this.runtimeBridge(), projectId, source, targetProviderId);
  }
  consumePendingInitialPrompt(projectId: string, sessionId: string): string | undefined {
    return consumePendingInitialPromptFromState(this.state, projectId, sessionId);
  }
  setActiveSession(projectId: string, sessionId: string): void {
    setActiveSessionWithBridge(this.runtimeBridge(), projectId, sessionId);
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
    this.persist(); this.emit('project-changed');
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

  focusCliSurfaceTab(projectId: string): void { this.updateProjectSurface(projectId, focusCliProjectSurface); }
  closeCliSurface(projectId: string): void { this.updateProjectSurface(projectId, closeCliProjectSurface); }
  focusMobileSurfaceTab(projectId: string): void { this.updateProjectSurface(projectId, focusMobileProjectSurface); }
  closeMobileSurface(projectId: string): void { this.updateProjectSurface(projectId, closeMobileProjectSurface); }

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
    setSurfaceTargetSessionWithBridge(this.runtimeBridge(), projectId, targetSessionId);
  }

  updateSessionCliId(projectId: string, sessionId: string, cliSessionId: string): void {
    updateSessionCliIdWithBridge(this.runtimeBridge(), projectId, sessionId, cliSessionId);
  }

  /** @deprecated Use updateSessionCliId */
  updateSessionClaudeId(projectId: string, sessionId: string, claudeSessionId: string): void {
    this.updateSessionCliId(projectId, sessionId, claudeSessionId);
  }

  hasSession(sessionId: string): boolean {
    return findSessionById(this.state.projects, sessionId) !== undefined;
  }

  updateSessionCost(sessionId: string, cost: CostInfo): void {
    updateSessionCostWithBridge(this.runtimeBridge(), sessionId, cost);
  }

  updateSessionContext(sessionId: string, context: ContextWindowInfo): void {
    updateSessionContextWithBridge(this.runtimeBridge(), sessionId, context);
  }

  updateSessionBrowserTabUrl(sessionId: string, url: string): void {
    updateSessionBrowserTabUrlWithBridge(this.runtimeBridge(), sessionId, url);
  }

  passivateBrowserTabSession(sessionId: string, failedUrl?: string): void {
    passivateBrowserTabSessionWithBridge(this.runtimeBridge(), sessionId, failedUrl);
  }

  renameSession(projectId: string, sessionId: string, name: string, userRenamed?: boolean): void {
    renameSessionWithBridge(this.runtimeBridge(), projectId, sessionId, name, MAX_SESSION_NAME_LENGTH, userRenamed);
  }

  setBrowserWidthRatio(projectId: string, ratio: number): void {
    setBrowserWidthRatioWithBridge(this.runtimeBridge(), projectId, ratio);
  }

  setMosaicRatio(projectId: string, key: string, ratio: number): void {
    setMosaicRatioWithBridge(this.runtimeBridge(), projectId, key, ratio);
  }

  cycleSession(direction: 1 | -1): void {
    const nextSessionId = cycleActiveProjectSession(this.activeProject, direction);
    if (!nextSessionId) return;
    this.pushNav(nextSessionId); this.persist(); this.emit('session-changed');
  }
  gotoSession(index: number): void {
    const nextSessionId = gotoProjectSession(this.activeProject, index);
    if (!nextSessionId) return;
    this.pushNav(nextSessionId); this.persist(); this.emit('session-changed');
  }

  private removeSessionsByScope(projectId: string, scope: SessionRemovalScope, anchorSessionId?: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    const ids = collectProjectSessionIdsForScope(project, scope, anchorSessionId);
    for (const id of ids) this.removeSession(projectId, id);
  }

  removeAllSessions(projectId: string): void { this.removeSessionsByScope(projectId, 'all'); }
  removeSessionsFromRight(projectId: string, sessionId: string): void { this.removeSessionsByScope(projectId, 'right', sessionId); }
  removeSessionsFromLeft(projectId: string, sessionId: string): void { this.removeSessionsByScope(projectId, 'left', sessionId); }
  removeOtherSessions(projectId: string, sessionId: string): void { this.removeSessionsByScope(projectId, 'others', sessionId); }

  addInsightSnapshot(projectId: string, snapshot: InitialContextSnapshot): void {
    addInsightSnapshotWithBridge(this.runtimeBridge(), projectId, snapshot);
  }

  dismissInsight(projectId: string, insightId: string): void {
    dismissInsightWithBridge(this.runtimeBridge(), projectId, insightId);
  }

  isInsightDismissed(projectId: string, insightId: string): boolean {
    return isInsightDismissedInAppState(this.state.projects, projectId, insightId);
  }

  reorderSession(projectId: string, sessionId: string, toIndex: number): void {
    reorderSessionWithBridge(this.runtimeBridge(), projectId, sessionId, toIndex);
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
