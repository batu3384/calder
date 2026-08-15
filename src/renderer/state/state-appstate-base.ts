import type { ProjectGovernanceState } from '../../shared/types/governance.js';
import type { ProjectBackgroundTaskState } from '../../shared/types/project-background-task.js';
import type { ProjectCheckpointState } from '../../shared/types/project-checkpoint.js';
import type { ProjectContextState } from '../../shared/types/project-context.js';
import type { ProjectReviewState } from '../../shared/types/project-review.js';
import type {
  PersistedState,
  Preferences,
  ProjectRecord,
} from '../../shared/types/project-state.js';
import { CURRENT_PERSISTED_STATE_VERSION } from '../../shared/types/project-state.js';
import type { ProjectSurfaceRecord } from '../../shared/types/project-surface.js';
import type { ProjectTeamContextState } from '../../shared/types/project-team-context.js';
import type { ProjectWorkflowState } from '../../shared/types/project-workflow.js';
import type { SessionRecord } from '../../shared/types/session.js';
import { showErrorToast } from '../components/toast.js';
import { findProjectBySessionId } from '../state-appstate-extracts.js';
import { migrateLoadedRendererState } from '../state-load-migration.js';
import { RendererStateNavigation } from '../state-navigation.js';
import {
  normalizeProjectBackgroundTaskState,
  normalizeProjectCheckpointState,
  normalizeProjectContextState,
  normalizeProjectGovernanceState,
  normalizeProjectReviewState,
  normalizeProjectTeamContextState,
  normalizeProjectWorkflowState,
} from '../state-normalizers.js';
import { buildRendererPersistSnapshot } from '../state-persist-snapshot.js';
import { RendererPersistQueue } from '../state-persistence.js';
import type { ProjectDomainStateKey } from '../state-project-domain-updater.js';
import { findProjectForPath as findProjectRecordForPath } from '../state-project-lookup.js';
import { applyProjectSurface } from '../state-surface-updater.js';
import { BatchedEventEmitter } from './batched-event-emitter.js';
import {
  createAppStateRuntimeBridge,
  setProjectDomainForState,
  updateProjectSurfaceForState,
} from './state-appstate-orchestration-helpers.js';
import type { AppStateRuntimeBridge } from './state-appstate-runtime-bridge.js';
import {
  defaultPreferences,
  type EventCallback,
  type EventType,
  NAV_HISTORY_MAX,
} from './state-contracts.js';
import { addProjectToState, removeProjectFromState } from './state-project-session-helpers.js';

export class AppStateBase {
  protected state: PersistedState = {
    version: CURRENT_PERSISTED_STATE_VERSION,
    projects: [],
    activeProjectId: null,
    preferences: { ...defaultPreferences },
  };
  private eventBus = new BatchedEventEmitter();
  private navigation = new RendererStateNavigation(NAV_HISTORY_MAX);
  private persistQueue = new RendererPersistQueue(
    (snapshot) => window.calder.store.save(snapshot),
    (error) => {
      showErrorToast('Failed to save project state');
      console.warn('Failed to persist renderer state:', error);
    },
  );

  protected pushNav(sessionId: string | null | undefined): void {
    this.navigation.push(sessionId);
  }
  protected pruneNav(sessionId: string): void {
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
    return this.eventBus.on(event, cb);
  }

  protected emit(event: EventType, data?: unknown): void {
    this.eventBus.emit(event, data);
  }

  async load(options: { emitLoaded?: boolean } = {}): Promise<void> {
    const loaded = (await window.calder.store.load()) as PersistedState | null;
    let didMigrateState = false;
    if (loaded && (loaded.version === 1 || loaded.version === CURRENT_PERSISTED_STATE_VERSION)) {
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

    if (options.emitLoaded !== false) {
      this.emit('state-loaded');
    }
  }

  emitStateLoaded(): void {
    this.emit('state-loaded');
  }

  protected persist(): void {
    this.persistQueue.enqueue(buildRendererPersistSnapshot(this.state));
  }

  flushPendingEventsForUnload(): void {
    this.eventBus.flushPending();
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

  private setProjectDomain<K extends ProjectDomainStateKey>(
    projectId: string,
    key: K,
    incoming: ProjectRecord[K],
    normalize: (
      incoming: NonNullable<ProjectRecord[K]>,
      previous: ProjectRecord[K],
    ) => ProjectRecord[K],
  ): void {
    setProjectDomainForState({
      projects: this.state.projects,
      activeProjectId: this.state.activeProjectId,
      projectId,
      key,
      incoming,
      normalize,
      persist: () => this.persist(),
      emit: (event) => this.emit(event),
    });
  }

  protected runtimeBridge(): AppStateRuntimeBridge {
    return createAppStateRuntimeBridge({
      state: this.state,
      pushNav: (sessionId) => this.pushNav(sessionId),
      pruneNav: (sessionId) => this.pruneNav(sessionId),
      persist: () => this.persist(),
      emit: (event, data) => this.emit(event, data),
      buildResumePrompt: (sourceProviderId, sourceCliSessionId, projectPath, sourceName) =>
        window.calder.session.buildResumeWithPrompt(
          sourceProviderId,
          sourceCliSessionId,
          projectPath,
          sourceName,
        ),
    });
  }

  setProjectContext(projectId: string, projectContext: ProjectContextState | undefined): void {
    this.setProjectDomain(
      projectId,
      'projectContext',
      projectContext,
      normalizeProjectContextState,
    );
  }
  setProjectWorkflows(projectId: string, projectWorkflows: ProjectWorkflowState | undefined): void {
    this.setProjectDomain(
      projectId,
      'projectWorkflows',
      projectWorkflows,
      normalizeProjectWorkflowState,
    );
  }
  setProjectTeamContext(
    projectId: string,
    projectTeamContext: ProjectTeamContextState | undefined,
  ): void {
    this.setProjectDomain(
      projectId,
      'projectTeamContext',
      projectTeamContext,
      normalizeProjectTeamContextState,
    );
  }
  setProjectReviews(projectId: string, projectReviews: ProjectReviewState | undefined): void {
    this.setProjectDomain(projectId, 'projectReviews', projectReviews, normalizeProjectReviewState);
  }
  setProjectGovernance(
    projectId: string,
    projectGovernance: ProjectGovernanceState | undefined,
  ): void {
    this.setProjectDomain(
      projectId,
      'projectGovernance',
      projectGovernance,
      normalizeProjectGovernanceState,
    );
  }
  setProjectBackgroundTasks(
    projectId: string,
    projectBackgroundTasks: ProjectBackgroundTaskState | undefined,
  ): void {
    this.setProjectDomain(
      projectId,
      'projectBackgroundTasks',
      projectBackgroundTasks,
      normalizeProjectBackgroundTaskState,
    );
  }
  setProjectCheckpoints(
    projectId: string,
    projectCheckpoints: ProjectCheckpointState | undefined,
  ): void {
    this.setProjectDomain(
      projectId,
      'projectCheckpoints',
      projectCheckpoints,
      normalizeProjectCheckpointState,
    );
  }

  addProject(name: string, path: string): ProjectRecord {
    const project = addProjectToState(this.state, name, path);
    this.persist();
    this.emit('project-added', project);
    this.emit('project-changed');
    return project;
  }

  removeProject(id: string): void {
    const sessions = removeProjectFromState(this.state, id);
    this.persist();
    for (const session of sessions)
      this.emit('session-removed', { projectId: id, sessionId: session.id });
    this.emit('project-removed', id);
    this.emit('project-changed');
  }

  setProjectSurface(projectId: string, surface: ProjectSurfaceRecord): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    applyProjectSurface(project, surface);
    this.persist();
    this.emit('project-changed');
  }

  private updateProjectSurface(
    projectId: string,
    mutate: (project: ProjectRecord) => boolean,
  ): void {
    updateProjectSurfaceForState({
      projects: this.state.projects,
      projectId,
      mutate,
      persist: () => this.persist(),
      emit: (event) => this.emit(event),
    });
  }

  resetForTesting(): void {
    this.state = {
      version: CURRENT_PERSISTED_STATE_VERSION,
      projects: [],
      activeProjectId: null,
      preferences: { ...defaultPreferences },
    };
    this.eventBus.destroy();
    this.navigation.resetForTesting();
    this.persistQueue.resetForTesting();
  }
}
