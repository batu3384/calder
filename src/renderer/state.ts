import type { CalderApi } from './types.js';
import type { SessionRecord, ProjectRecord, Preferences, PersistedState, ArchivedSession, ProviderId, CostInfo, ContextWindowInfo, InitialContextSnapshot, ProjectSurfaceRecord, ProjectContextState, ProjectWorkflowState, ProjectTeamContextState, ProjectReviewState, ProjectGovernanceState, ProjectBackgroundTaskState, ProjectCheckpointState, ProjectCheckpointDocument, ProjectCheckpointRestoreMode, ProjectWorkflowDocument } from '../shared/types.js';
import { getCost, restoreCost } from './session-cost.js';
import { restoreContext } from './session-context.js';
import { getProviderCapabilities, getProviderAvailabilitySnapshot } from './provider-availability.js';
import { clampRatio } from './components/mosaic-layout-model.js';
import { appendProjectGovernanceToPrompt } from './project-governance-prompt.js';
import { appendProjectTeamContextToPrompt } from './project-team-context-prompt.js';
import { RendererPersistQueue } from './state-persistence.js';
import { RendererStateNavigation } from './state-navigation.js';
import { buildRendererPersistSnapshot } from './state-persist-snapshot.js';
import {
  addInsightSnapshotToProject,
  dismissInsightForProject,
  isInsightDismissedForProject,
  reorderProjectSession,
} from './state-session-mutators.js';
import {
  findActiveCliSession,
  findProjectSession,
  isCliSessionRecord,
  repairProjectSurface,
  resolveSurfaceTargetFromProject,
} from './state-project-surface.js';
import { findProjectForPath as findProjectRecordForPath } from './state-project-lookup.js';
import { setProjectDomainState } from './state-project-domain-updater.js';
import {
  buildWorkflowLaunchPrompt,
  DEFAULT_BROWSER_WIDTH_RATIO,
  deriveBrowserSessionName,
  normalizeProjectBackgroundTaskState,
  normalizeProjectCheckpointState,
  normalizeProjectContextState,
  normalizeProjectGovernanceState,
  normalizeProjectLayout,
  normalizeProjectReviewState,
  normalizeProjectSurface,
  normalizeProjectTeamContextState,
  normalizeProjectWorkflowState,
  stripTransientRuntimeFields,
} from './state-normalizers.js';

export type { SessionRecord, ProjectRecord, Preferences, PersistedState, ArchivedSession } from '../shared/types.js';

export const MAX_SESSION_NAME_LENGTH = 60;

declare global {
  interface Window {
    calder: CalderApi;
  }
}

type EventType =
  | 'project-added'
  | 'project-removed'
  | 'project-changed'
  | 'session-added'
  | 'session-removed'
  | 'session-changed'
  | 'layout-changed'
  | 'preferences-changed'
  | 'terminal-panel-changed'
  | 'history-changed'
  | 'insights-changed'
  | 'sidebar-toggled'
  | 'cli-session-cleared'
  | 'state-loaded';

type EventCallback = (data?: unknown) => void;

const defaultPreferences: Preferences = {
  soundOnSessionWaiting: true,
  notificationsDesktop: true,
  debugMode: false,
  sessionHistoryEnabled: true,
  insightsEnabled: true,
  autoTitleEnabled: true,
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

  private findProjectBySession(sessionId: string): ProjectRecord | undefined {
    return this.state.projects.find((p) => p.sessions.some((s) => s.id === sessionId));
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
      (sessionId) => this.findProjectBySession(sessionId),
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
      this.state = loaded;
      // Merge defaults for forward compatibility with old state files
      const normalizedPreferences = { ...defaultPreferences, ...this.state.preferences };
      if (JSON.stringify(this.state.preferences) !== JSON.stringify(normalizedPreferences)) {
        didMigrateState = true;
      }
      this.state.preferences = normalizedPreferences;
      delete (this.state.preferences as Preferences & { readinessExcludedProviders?: ProviderId[] }).readinessExcludedProviders;
      if (this.state.preferences.sidebarViews) {
        delete (
          this.state.preferences.sidebarViews as Preferences['sidebarViews'] & { readinessSection?: boolean }
        ).readinessSection;
      }
      const normalizedProjects = this.state.projects.map((project) => {
        const nextProject = {
          ...(project as ProjectRecord & { readiness?: unknown }),
          layout: normalizeProjectLayout(project.layout),
          surface: normalizeProjectSurface(project),
        };
        delete (nextProject as ProjectRecord & { readiness?: unknown }).readiness;
        return nextProject;
      });
      if (JSON.stringify(this.state.projects) !== JSON.stringify(normalizedProjects)) {
        didMigrateState = true;
      }
      this.state.projects = normalizedProjects;
      // Restore persisted cost data into the in-memory cost tracker
      for (const project of this.state.projects) {
        if (repairProjectSurface(project)) {
          didMigrateState = true;
        }
        for (const session of project.sessions) {
          if (session.cost) {
            restoreCost(session.id, session.cost);
          }
          if (session.contextWindow) {
            restoreContext(session.id, session.contextWindow);
          }
        }
        // Migrate duplicate archived session IDs (caused by /clear creating two entries with same id)
        if (project.sessionHistory) {
          const seenIds = new Set<string>();
          for (const entry of project.sessionHistory) {
            if (seenIds.has(entry.id)) {
              entry.id = crypto.randomUUID();
              didMigrateState = true;
            }
            seenIds.add(entry.id);
          }
        }
      }
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

  setProjectContext(projectId: string, projectContext: ProjectContextState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectContext', projectContext, normalizeProjectContextState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectWorkflows(projectId: string, projectWorkflows: ProjectWorkflowState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectWorkflows', projectWorkflows, normalizeProjectWorkflowState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectTeamContext(projectId: string, projectTeamContext: ProjectTeamContextState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectTeamContext', projectTeamContext, normalizeProjectTeamContextState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectReviews(projectId: string, projectReviews: ProjectReviewState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectReviews', projectReviews, normalizeProjectReviewState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectGovernance(projectId: string, projectGovernance: ProjectGovernanceState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectGovernance', projectGovernance, normalizeProjectGovernanceState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectBackgroundTasks(projectId: string, projectBackgroundTasks: ProjectBackgroundTaskState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectBackgroundTasks', projectBackgroundTasks, normalizeProjectBackgroundTaskState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  setProjectCheckpoints(projectId: string, projectCheckpoints: ProjectCheckpointState | undefined): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!setProjectDomainState(project, 'projectCheckpoints', projectCheckpoints, normalizeProjectCheckpointState)) return;
    this.persist();
    this.emitProjectChangedIfActive(project);
  }

  restoreProjectCheckpoint(
    projectId: string,
    checkpoint: ProjectCheckpointDocument,
    mode: ProjectCheckpointRestoreMode = 'additive',
  ): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;

    const restoredIdMap = new Map<string, string>();
    const createdSessions: SessionRecord[] = [];
    const removedSessions = mode === 'replace'
      ? [...project.sessions]
      : [];

    if (mode === 'replace') {
      for (const session of removedSessions) {
        this.pruneNav(session.id);
      }
      project.sessions = [];
      project.activeSessionId = null;
      project.layout.splitPanes = [];
      project.surface = normalizeProjectSurface(project);
    }

    for (const snapshot of checkpoint.sessions) {
      if (snapshot.type === 'browser-tab') {
        if (!snapshot.browserTabUrl) continue;
        const existingBrowser = project.sessions.find(
          (session) => session.type === 'browser-tab' && session.browserTabUrl === snapshot.browserTabUrl,
        );
        if (existingBrowser) {
          restoredIdMap.set(snapshot.id, existingBrowser.id);
          continue;
        }

        const browserSession: SessionRecord = {
          id: crypto.randomUUID(),
          name: deriveBrowserSessionName(snapshot.browserTabUrl, snapshot.name || 'Browser'),
          type: 'browser-tab',
          browserTabUrl: snapshot.browserTabUrl,
          cliSessionId: null,
          createdAt: new Date().toISOString(),
        };
        project.sessions.push(browserSession);
        restoredIdMap.set(snapshot.id, browserSession.id);
        createdSessions.push(browserSession);
        continue;
      }

      if (snapshot.type === 'file-reader') {
        if (!snapshot.fileReaderPath) continue;
        const existingReader = project.sessions.find(
          (session) => session.type === 'file-reader' && session.fileReaderPath === snapshot.fileReaderPath,
        );
        if (existingReader) {
          existingReader.fileReaderLine = snapshot.fileReaderLine;
          restoredIdMap.set(snapshot.id, existingReader.id);
          continue;
        }

        const readerSession: SessionRecord = {
          id: crypto.randomUUID(),
          name: snapshot.name,
          type: 'file-reader',
          fileReaderPath: snapshot.fileReaderPath,
          ...(snapshot.fileReaderLine !== undefined ? { fileReaderLine: snapshot.fileReaderLine } : {}),
          cliSessionId: null,
          createdAt: new Date().toISOString(),
        };
        project.sessions.push(readerSession);
        restoredIdMap.set(snapshot.id, readerSession.id);
        createdSessions.push(readerSession);
        continue;
      }

      if (snapshot.type === 'diff-viewer') {
        if (!snapshot.diffFilePath || !snapshot.diffArea) continue;
        const existingDiff = project.sessions.find(
          (session) =>
            session.type === 'diff-viewer'
            && session.diffFilePath === snapshot.diffFilePath
            && session.diffArea === snapshot.diffArea
            && session.worktreePath === snapshot.worktreePath,
        );
        if (existingDiff) {
          restoredIdMap.set(snapshot.id, existingDiff.id);
          continue;
        }

        const diffSession: SessionRecord = {
          id: crypto.randomUUID(),
          name: snapshot.name,
          type: 'diff-viewer',
          diffFilePath: snapshot.diffFilePath,
          diffArea: snapshot.diffArea,
          ...(snapshot.worktreePath ? { worktreePath: snapshot.worktreePath } : {}),
          cliSessionId: null,
          createdAt: new Date().toISOString(),
        };
        project.sessions.push(diffSession);
        restoredIdMap.set(snapshot.id, diffSession.id);
        createdSessions.push(diffSession);
        continue;
      }

      if (snapshot.type && snapshot.type !== 'claude') {
        continue;
      }

      const existingCli = snapshot.cliSessionId
        ? project.sessions.find((session) => isCliSessionRecord(session) && session.cliSessionId === snapshot.cliSessionId)
        : project.sessions.find((session) =>
          isCliSessionRecord(session)
          && session.cliSessionId === null
          && session.name === snapshot.name
          && (session.providerId ?? this.state.preferences.defaultProvider ?? 'claude') === (snapshot.providerId ?? this.state.preferences.defaultProvider ?? 'claude'));

      if (existingCli) {
        restoredIdMap.set(snapshot.id, existingCli.id);
        continue;
      }

      const restoredCli: SessionRecord = {
        id: crypto.randomUUID(),
        name: snapshot.name,
        providerId: snapshot.providerId ?? this.state.preferences.defaultProvider ?? 'claude',
        ...(snapshot.args ? { args: snapshot.args } : {}),
        cliSessionId: snapshot.cliSessionId,
        createdAt: new Date().toISOString(),
      };
      project.sessions.push(restoredCli);
      if (project.layout.mode === 'mosaic') {
        project.layout.splitPanes.push(restoredCli.id);
      }
      restoredIdMap.set(snapshot.id, restoredCli.id);
      createdSessions.push(restoredCli);
    }

    for (const snapshot of checkpoint.sessions) {
      if (snapshot.type !== 'browser-tab') continue;
      const restoredBrowserId = restoredIdMap.get(snapshot.id);
      if (!restoredBrowserId) continue;
      const restoredBrowser = findProjectSession(project, restoredBrowserId);
      if (!restoredBrowser || restoredBrowser.type !== 'browser-tab') continue;
      const restoredTargetId = snapshot.browserTargetSessionId
        ? restoredIdMap.get(snapshot.browserTargetSessionId)
        : undefined;
      if (restoredTargetId) {
        restoredBrowser.browserTargetSessionId = restoredTargetId;
      }
    }

    const checkpointSurface = checkpoint.surface;
    project.surface = normalizeProjectSurface(project);

    if (checkpointSurface) {
      project.surface.kind = checkpointSurface.kind;
      project.surface.active = checkpointSurface.active;

      const mappedTargetId = checkpointSurface.targetSessionId
        ? restoredIdMap.get(checkpointSurface.targetSessionId)
        : undefined;
      if (mappedTargetId) {
        project.surface.targetSessionId = mappedTargetId;
      }

      if (checkpointSurface.kind === 'web') {
        const mappedWebSessionId = checkpointSurface.webSessionId
          ? restoredIdMap.get(checkpointSurface.webSessionId)
          : undefined;
        const webUrl = checkpointSurface.webUrl
          ?? (mappedWebSessionId ? findProjectSession(project, mappedWebSessionId)?.browserTabUrl : undefined);
        project.surface.web = {
          sessionId: mappedWebSessionId,
          url: webUrl,
          history: webUrl
            ? Array.from(new Set([...(project.surface.web?.history ?? []), webUrl]))
            : (project.surface.web?.history ?? []),
        };
      }

      if (project.surface.cli) {
        project.surface.cli = {
          ...project.surface.cli,
          selectedProfileId: checkpointSurface.cliSelectedProfileId ?? project.surface.cli.selectedProfileId,
          runtime: {
            ...(project.surface.cli.runtime ?? { status: 'idle' }),
            status: checkpointSurface.cliStatus ?? project.surface.cli.runtime?.status ?? 'idle',
          },
        };
      }
    }

    const nextActiveId = checkpoint.activeSessionId
      ? restoredIdMap.get(checkpoint.activeSessionId)
      : undefined;
    if (nextActiveId) {
      project.activeSessionId = nextActiveId;
      this.pushNav(nextActiveId);
    }

    repairProjectSurface(project);
    this.persist();

    for (const session of removedSessions) {
      this.emit('session-removed', { projectId, sessionId: session.id });
    }
    for (const session of createdSessions) {
      this.emit('session-added', { projectId, session });
    }
    this.emit('project-changed');
    this.emit('session-changed');
  }

  addProject(name: string, path: string): ProjectRecord {
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      name,
      path,
      sessions: [],
      activeSessionId: null,
      surface: {
        kind: 'web',
        active: false,
        tabFocus: 'session',
        web: { history: [] },
        cli: { profiles: [], runtime: { status: 'idle' } },
      },
      layout: normalizeProjectLayout({ mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' }),
    };
    this.state.projects.push(project);
    this.state.activeProjectId = project.id;
    this.persist();
    this.emit('project-added', project);
    this.emit('project-changed');
    return project;
  }

  removeProject(id: string): void {
    const project = this.state.projects.find((p) => p.id === id);
    const sessions = project?.sessions ?? [];

    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    if (this.state.activeProjectId === id) {
      this.state.activeProjectId = this.state.projects[0]?.id ?? null;
    }
    this.persist();
    for (const session of sessions) {
      this.emit('session-removed', { projectId: id, sessionId: session.id });
    }
    this.emit('project-removed', id);
    this.emit('project-changed');
  }

  addPlanSession(projectId: string, name: string, providerOverride?: ProviderId): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;
    const activeSession = project.sessions.find((s) => s.id === project.activeSessionId);
    const providerId = providerOverride ?? this.state.preferences.defaultProvider ?? activeSession?.providerId ?? 'claude';
    const caps = getProviderCapabilities(providerId);
    const planArg = caps?.planModeArg ?? '';
    const base = project.defaultArgs ?? '';
    const args = [base, planArg].filter(Boolean).join(' ').trim() || undefined;
    return this.addSession(projectId, name, args, providerId);
  }

  launchWorkflowSession(
    projectId: string,
    workflow: ProjectWorkflowDocument,
    providerOverride?: ProviderId,
  ): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name: workflow.title,
      providerId: providerOverride ?? this.state.preferences.defaultProvider ?? 'claude',
      ...(project.defaultArgs ? { args: project.defaultArgs } : {}),
      cliSessionId: null,
      createdAt: new Date().toISOString(),
      pendingInitialPrompt: appendProjectGovernanceToPrompt(
        appendProjectTeamContextToPrompt(buildWorkflowLaunchPrompt(workflow), project.projectTeamContext),
        project.projectGovernance,
      ),
    };

    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    if (project.layout.mode === 'mosaic') {
      project.layout.splitPanes.push(session.id);
    }
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  addSession(projectId: string, name: string, args?: string, providerId?: ProviderId): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    const effectiveArgs = args ?? project.defaultArgs;
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name,
      providerId: providerId ?? this.state.preferences.defaultProvider ?? 'claude',
      ...(effectiveArgs ? { args: effectiveArgs } : {}),
      cliSessionId: null,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    // Auto-add visible CLI sessions to the mosaic canvas.
    if (project.layout.mode === 'mosaic') {
      project.layout.splitPanes.push(session.id);
    }
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  addDiffViewerSession(projectId: string, filePath: string, area: string, worktreePath?: string): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    // If a diff tab for this file+area+worktree already exists, just switch to it
    const existing = project.sessions.find(
      (s) => s.type === 'diff-viewer' && s.diffFilePath === filePath && s.diffArea === area && s.worktreePath === worktreePath
    );
    if (existing) {
      project.activeSessionId = existing.id;
      this.pushNav(existing.id);
      this.persist();
      this.emit('session-changed');
      return existing;
    }

    const name = filePath.split('/').pop() || filePath;
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name,
      type: 'diff-viewer',
      diffFilePath: filePath,
      diffArea: area,
      ...(worktreePath ? { worktreePath } : {}),
      cliSessionId: null,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  addRemoteSession(projectId: string, sessionId: string, hostSessionName: string, shareMode: 'readonly' | 'readwrite'): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    const session: SessionRecord = {
      id: sessionId,
      name: `Remote: ${hostSessionName}`,
      type: 'remote-terminal',
      remoteHostName: hostSessionName,
      shareMode,
      cliSessionId: null,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  addBrowserTabSession(
    projectId: string,
    url?: string,
    options?: { dedupeByUrl?: boolean },
  ): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;
    const initialTargetSession = findActiveCliSession(project);
    const dedupeByUrl = options?.dedupeByUrl ?? true;

    // If a browser-tab with the same URL already exists, switch to it
    if (url && dedupeByUrl) {
      const existing = project.sessions.find(
        (s) => s.type === 'browser-tab' && s.browserTabUrl === url
      );
      if (existing) {
        project.activeSessionId = existing.id;
        this.pushNav(existing.id);
        this.persist();
        this.emit('session-changed');
        return existing;
      }
    }

    let name = 'Browser';
    if (url) {
      try { name = new URL(url).hostname || url; } catch { name = url; }
    }
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name,
      type: 'browser-tab',
      browserTabUrl: url,
      ...(initialTargetSession ? { browserTargetSessionId: initialTargetSession.id } : {}),
      cliSessionId: null,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    project.surface = normalizeProjectSurface(project);
    project.surface.kind = 'web';
    project.surface.active = true;
    project.surface.tabFocus = 'session';
    project.surface.web = {
      sessionId: session.id,
      url,
      history: url
        ? Array.from(new Set([...(project.surface.web?.history ?? []), url]))
        : (project.surface.web?.history ?? []),
    };
    if (initialTargetSession) {
      project.surface.targetSessionId = initialTargetSession.id;
    }
    this.pushNav(session.id);
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  openUrlInBrowserSurface(projectId: string, url: string): SessionRecord | undefined {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return undefined;

    const activeBrowserSession = project.activeSessionId
      ? project.sessions.find((session) => session.id === project.activeSessionId && session.type === 'browser-tab')
      : undefined;
    const currentSurfaceSessionId = project.surface?.web?.sessionId;
    const currentSurfaceSession = currentSurfaceSessionId
      ? project.sessions.find((session) => session.id === currentSurfaceSessionId && session.type === 'browser-tab')
      : undefined;
    const fallbackBrowserSession = currentSurfaceSession
      ?? [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
    const targetBrowserSession = currentSurfaceSession ?? activeBrowserSession ?? fallbackBrowserSession;

    if (!targetBrowserSession) {
      return this.addBrowserTabSession(project.id, url);
    }

    project.activeSessionId = targetBrowserSession.id;
    this.pushNav(targetBrowserSession.id);
    targetBrowserSession.browserTabUrl = url;
    project.surface = normalizeProjectSurface(project);
    project.surface.kind = 'web';
    project.surface.active = true;
    project.surface.tabFocus = 'session';
    project.surface.web = {
      sessionId: targetBrowserSession.id,
      url,
      history: Array.from(new Set([...(project.surface.web?.history ?? []), url])),
    };
    if (targetBrowserSession.browserTargetSessionId) {
      project.surface.targetSessionId = targetBrowserSession.browserTargetSessionId;
    }
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
    return targetBrowserSession;
  }

  addFileReaderSession(projectId: string, filePath: string, lineNumber?: number): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    // If a file-reader tab for this path already exists, just switch to it
    const existing = project.sessions.find(
      (s) => s.type === 'file-reader' && s.fileReaderPath === filePath
    );
    if (existing) {
      existing.fileReaderLine = lineNumber;
      project.activeSessionId = existing.id;
      this.pushNav(existing.id);
      this.persist();
      this.emit('session-changed');
      return existing;
    }

    const name = filePath.split('/').pop() || filePath;
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name,
      type: 'file-reader',
      fileReaderPath: filePath,
      ...(lineNumber !== undefined ? { fileReaderLine: lineNumber } : {}),
      cliSessionId: null,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  addMcpInspectorSession(projectId: string, name: string): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name,
      type: 'mcp-inspector',
      cliSessionId: null,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  removeSession(projectId: string, sessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;

    // Archive CLI sessions before removing (cost data must be captured before session-removed triggers destroyTerminal)
    const session = project.sessions.find((s) => s.id === sessionId);
    if (session && (!session.type || session.type === 'claude') && this.state.preferences.sessionHistoryEnabled) {
      // Skip archiving empty sessions (no CLI activity)
      if (session.cliSessionId || getCost(session.id) !== null) {
        this.archiveSession(project, session);
      }
    }

    const closingIndex = project.sessions.findIndex((s) => s.id === sessionId);
    project.sessions = project.sessions.filter((s) => s.id !== sessionId);
    this.pruneNav(sessionId);
    if (project.activeSessionId === sessionId) {
      const newIndex = closingIndex > 0 ? closingIndex - 1 : 0;
      project.activeSessionId = project.sessions[newIndex]?.id ?? null;
      if (project.activeSessionId) this.pushNav(project.activeSessionId);
    }
    repairProjectSurface(project);
    // Keep the mosaic pane list in sync with removed sessions.
    project.layout.splitPanes = project.layout.splitPanes.filter((id) => id !== sessionId);
    this.persist();
    this.emit('session-removed', { projectId, sessionId });
    this.emit('session-changed');
  }

  private archiveSession(project: ProjectRecord, session: SessionRecord): void {
    const costInfo = getCost(session.id);
    const archived: ArchivedSession = {
      id: crypto.randomUUID(),
      name: session.name,
      providerId: (session.providerId || 'claude') as ProviderId,
      cliSessionId: session.cliSessionId,
      createdAt: session.createdAt,
      closedAt: new Date().toISOString(),
      cost: costInfo ? {
        totalCostUsd: costInfo.totalCostUsd,
        totalInputTokens: costInfo.totalInputTokens,
        totalOutputTokens: costInfo.totalOutputTokens,
        totalDurationMs: costInfo.totalDurationMs,
        source: costInfo.source,
      } : null,
    };

    if (!project.sessionHistory) project.sessionHistory = [];

    // If a history entry with the same cliSessionId exists, update it instead of creating a duplicate
    const existingIndex = archived.cliSessionId
      ? project.sessionHistory.findIndex((a) => a.cliSessionId === archived.cliSessionId)
      : -1;
    if (existingIndex !== -1) {
      project.sessionHistory[existingIndex].closedAt = archived.closedAt;
      if (archived.cost) project.sessionHistory[existingIndex].cost = archived.cost;
      if (archived.name !== project.sessionHistory[existingIndex].name) {
        project.sessionHistory[existingIndex].name = archived.name;
      }
    } else {
      project.sessionHistory.push(archived);
    }

    // Cap at 500 entries per project, preserving bookmarked sessions
    if (project.sessionHistory.length > 500) {
      let nonBookmarkedToRemove = project.sessionHistory.length - 500;
      project.sessionHistory = project.sessionHistory.filter((a) => {
        if (a.bookmarked) return true;
        if (nonBookmarkedToRemove > 0) { nonBookmarkedToRemove--; return false; }
        return true;
      });
    }

    this.emit('history-changed', project.id);
  }

  getSessionHistory(projectId: string): ArchivedSession[] {
    const project = this.state.projects.find((p) => p.id === projectId);
    return project?.sessionHistory ?? [];
  }

  removeHistoryEntry(projectId: string, archivedSessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project?.sessionHistory) return;
    project.sessionHistory = project.sessionHistory.filter((a) => a.id !== archivedSessionId);
    this.persist();
    this.emit('history-changed', projectId);
  }

  toggleBookmark(projectId: string, archivedSessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project?.sessionHistory) return;
    const entry = project.sessionHistory.find((a) => a.id === archivedSessionId);
    if (!entry) return;
    entry.bookmarked = !entry.bookmarked;
    this.persist();
    this.emit('history-changed', projectId);
  }

  clearSessionHistory(projectId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.sessionHistory = project.sessionHistory?.filter((a) => a.bookmarked) ?? [];
    this.persist();
    this.emit('history-changed', projectId);
  }

  resumeFromHistory(projectId: string, archivedSessionId: string): SessionRecord | undefined {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    const archived = project.sessionHistory?.find((a) => a.id === archivedSessionId);
    if (!archived || !archived.cliSessionId) return undefined;

    // If a tab with the same cliSessionId is already open, just activate it
    const existing = project.sessions.find((s) => s.cliSessionId === archived.cliSessionId);
    if (existing) {
      project.activeSessionId = existing.id;
      this.pushNav(existing.id);
      this.persist();
      this.emit('session-changed');
      return existing;
    }

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name: archived.name,
      providerId: archived.providerId,
      cliSessionId: archived.cliSessionId,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    // Auto-add resumed CLI sessions to the mosaic canvas.
    if (project.layout.mode === 'mosaic') {
      project.layout.splitPanes.push(session.id);
    }
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
  }

  async resumeWithProvider(
    projectId: string,
    source: { archivedSessionId?: string; sessionId?: string },
    targetProviderId: ProviderId,
  ): Promise<SessionRecord | undefined> {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;

    // Defense-in-depth: UI gates this by availability, but bail if the target
    // provider isn't actually installed so we don't create a broken session.
    const snapshot = getProviderAvailabilitySnapshot();
    if (snapshot && snapshot.availability.get(targetProviderId) === false) {
      return undefined;
    }

    let sourceProviderId: ProviderId | undefined;
    let sourceCliSessionId: string | null = null;
    let sourceName = 'session';
    if (source.archivedSessionId) {
      const archived = project.sessionHistory?.find((a) => a.id === source.archivedSessionId);
      if (!archived) return undefined;
      sourceProviderId = archived.providerId;
      sourceCliSessionId = archived.cliSessionId;
      sourceName = archived.name;
    } else if (source.sessionId) {
      const existing = project.sessions.find((s) => s.id === source.sessionId);
      if (!existing) return undefined;
      sourceProviderId = existing.providerId;
      sourceCliSessionId = existing.cliSessionId;
      sourceName = existing.name;
    } else {
      return undefined;
    }
    if (!sourceProviderId) return undefined;

    const initialPrompt = await window.calder.session.buildResumeWithPrompt(
      sourceProviderId,
      sourceCliSessionId,
      project.path,
      sourceName,
    );

    const session: SessionRecord = {
      id: crypto.randomUUID(),
      name: `${sourceName} (↪ ${targetProviderId})`,
      providerId: targetProviderId,
      cliSessionId: null,
      createdAt: new Date().toISOString(),
      pendingInitialPrompt: appendProjectGovernanceToPrompt(
        appendProjectTeamContextToPrompt(initialPrompt, project.projectTeamContext),
        project.projectGovernance,
      ),
    };
    project.sessions.push(session);
    project.activeSessionId = session.id;
    this.pushNav(session.id);
    if (project.layout.mode === 'mosaic') {
      project.layout.splitPanes.push(session.id);
    }
    // persist() strips pendingInitialPrompt (transient). split-layout.onSessionAdded
    // will consume it synchronously from in-memory state before the next persist.
    this.persist();
    this.emit('session-added', { projectId, session });
    this.emit('session-changed');
    return session;
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
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.activeSessionId = sessionId;
    this.pushNav(sessionId);
    const activeSession = project.sessions.find((session) => session.id === sessionId);
    let surfaceChanged = false;
    if (
      (project.surface?.kind === 'cli' && project.surface.tabFocus === 'cli')
      || (project.surface?.kind === 'mobile' && project.surface.tabFocus === 'mobile')
    ) {
      project.surface = normalizeProjectSurface(project);
      project.surface.tabFocus = 'session';
      surfaceChanged = true;
    }
    if (activeSession?.type === 'browser-tab') {
      project.surface = normalizeProjectSurface(project);
      const preserveMobileSurface = project.surface.kind === 'mobile' && project.surface.active;
      if (!preserveMobileSurface) {
        project.surface.kind = 'web';
        project.surface.active = true;
      }
      project.surface.tabFocus = 'session';
      project.surface.web = project.surface.web ?? { history: [] };
      project.surface.web.sessionId = activeSession.id;
      project.surface.web.url = activeSession.browserTabUrl;
      if (activeSession.browserTabUrl) {
        project.surface.web.history = Array.from(
          new Set([...(project.surface.web.history ?? []), activeSession.browserTabUrl]),
        );
      }
      surfaceChanged = true;
    }
    this.persist();
    if (surfaceChanged) {
      this.emit('project-changed');
    }
    this.emit('session-changed');
  }

  listBrowserTargetSessions(browserSessionId: string): SessionRecord[] {
    const project = this.findProjectBySession(browserSessionId);
    return project ? this.listSurfaceTargetSessions(project.id) : [];
  }

  resolveBrowserTargetSession(browserSessionId: string): SessionRecord | undefined {
    const project = this.findProjectBySession(browserSessionId);
    return project ? this.resolveSurfaceTargetSession(project.id) : undefined;
  }

  setBrowserTargetSession(browserSessionId: string, targetSessionId: string | null): void {
    const project = this.findProjectBySession(browserSessionId);
    if (!project) return;
    this.setSurfaceTargetSession(project.id, targetSessionId);
  }

  setProjectSurface(projectId: string, surface: ProjectSurfaceRecord): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    const tabFocus = surface.kind === 'cli'
      ? (surface.tabFocus ?? (surface.active ? 'cli' : 'session'))
      : surface.kind === 'mobile'
        ? (surface.tabFocus ?? (surface.active ? 'mobile' : 'session'))
      : 'session';
    const tabPlacement = surface.tabPlacement === 'start' ? 'start' : 'end';
    const tabOrder = Array.isArray(surface.tabOrder)
      ? surface.tabOrder.filter((entry): entry is 'cli' | 'mobile' => entry === 'cli' || entry === 'mobile')
      : [];
    const normalizedTabOrder: Array<'cli' | 'mobile'> = (tabOrder.length === 2 && tabOrder.includes('cli') && tabOrder.includes('mobile'))
      ? tabOrder
      : ['cli', 'mobile'];
    project.surface = {
      ...surface,
      tabFocus,
      tabPlacement,
      tabOrder: normalizedTabOrder,
      web: surface.web
        ? {
            ...surface.web,
            history: surface.web.history ? [...surface.web.history] : [],
          }
        : { history: [] },
      cli: surface.cli
        ? {
            ...surface.cli,
            profiles: [...surface.cli.profiles],
            runtime: surface.cli.runtime ? stripTransientRuntimeFields(surface.cli.runtime) : undefined,
          }
        : { profiles: [], runtime: { status: 'idle' } },
    };
    repairProjectSurface(project);
    this.persist();
    this.emit('project-changed');
  }

  focusCliSurfaceTab(projectId: string): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    project.surface = normalizeProjectSurface(project);
    if (project.surface.kind !== 'cli') return;
    project.surface.active = true;
    project.surface.tabFocus = 'cli';
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  closeCliSurface(projectId: string): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    project.surface = normalizeProjectSurface(project);
    if (project.surface.kind !== 'cli') return;
    project.surface.active = false;
    project.surface.tabFocus = 'session';
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  focusMobileSurfaceTab(projectId: string): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    project.surface = normalizeProjectSurface(project);
    if (project.surface.kind !== 'mobile') return;
    project.surface.active = true;
    project.surface.tabFocus = 'mobile';
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  closeMobileSurface(projectId: string): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    project.surface = normalizeProjectSurface(project);
    if (project.surface.kind !== 'mobile') return;
    project.surface.kind = 'web';
    project.surface.active = false;
    project.surface.tabFocus = 'session';
    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  listSurfaceTargetSessions(projectId: string): SessionRecord[] {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return [];
    return project.sessions.filter((session) => isCliSessionRecord(session));
  }

  resolveSurfaceTargetSession(
    projectId: string,
    options?: { requireExplicitTarget?: boolean },
  ): SessionRecord | undefined {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return undefined;
    return resolveSurfaceTargetFromProject(project, {
      allowActiveFallback: options?.requireExplicitTarget ? false : true,
    });
  }

  setSurfaceTargetSession(projectId: string, targetSessionId: string | null): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    project.surface = normalizeProjectSurface(project);

    if (targetSessionId === null) {
      delete project.surface.targetSessionId;
      for (const session of project.sessions) {
        if (session.type === 'browser-tab') delete session.browserTargetSessionId;
      }
      this.persist();
      this.emit('session-changed');
      return;
    }

    const targetSession = findProjectSession(project, targetSessionId);
    if (!targetSession || !isCliSessionRecord(targetSession)) return;
    if (project.surface.targetSessionId === targetSessionId) return;
    project.surface.targetSessionId = targetSessionId;
    for (const session of project.sessions) {
      if (session.type === 'browser-tab') session.browserTargetSessionId = targetSessionId;
    }
    this.persist();
    this.emit('session-changed');
  }

  updateSessionCliId(projectId: string, sessionId: string, cliSessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const session = project.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // If session already had a different cliSessionId (e.g., /clear was used),
    // archive the previous session and reset the tab name
    if (session.cliSessionId && session.cliSessionId !== cliSessionId) {
      this.archiveSession(project, session);
      session.name = `Session ${project.sessions.length + (project.sessionHistory?.length || 0)}`;
      session.userRenamed = false;
      this.emit('cli-session-cleared', { sessionId });
    }

    session.cliSessionId = cliSessionId;
    this.persist();
    this.emit('session-changed');
  }

  /** @deprecated Use updateSessionCliId */
  updateSessionClaudeId(projectId: string, sessionId: string, claudeSessionId: string): void {
    this.updateSessionCliId(projectId, sessionId, claudeSessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.findSessionById(sessionId) !== undefined;
  }

  private findSessionById(sessionId: string): SessionRecord | undefined {
    for (const project of this.state.projects) {
      const session = project.sessions.find((s) => s.id === sessionId);
      if (session) return session;
    }
    return undefined;
  }

  updateSessionCost(sessionId: string, cost: CostInfo): void {
    const session = this.findSessionById(sessionId);
    if (!session) return;
    session.cost = { ...cost };
    this.persist();
  }

  updateSessionContext(sessionId: string, context: ContextWindowInfo): void {
    const session = this.findSessionById(sessionId);
    if (!session) return;
    session.contextWindow = { ...context };
    this.persist();
  }

  updateSessionBrowserTabUrl(sessionId: string, url: string): void {
    const project = this.findProjectBySession(sessionId);
    const session = this.findSessionById(sessionId);
    if (!session || session.browserTabUrl === url) return;
    session.browserTabUrl = url;
    if (project?.surface?.web?.sessionId === sessionId) {
      project.surface.web.url = url;
      project.surface.web.history = Array.from(new Set([...(project.surface.web.history ?? []), url]));
    }
    this.persist();
  }

  passivateBrowserTabSession(sessionId: string, failedUrl?: string): void {
    const project = this.findProjectBySession(sessionId);
    const session = this.findSessionById(sessionId);
    if (!project || !session || session.type !== 'browser-tab') return;

    const rememberedUrl = failedUrl ?? session.browserTabUrl;
    delete session.browserTabUrl;
    project.surface = normalizeProjectSurface(project);
    project.surface.web = project.surface.web ?? { history: [] };

    if (rememberedUrl) {
      project.surface.web.history = Array.from(new Set([...(project.surface.web.history ?? []), rememberedUrl]));
    }

    if (project.surface.web.sessionId === sessionId) {
      project.surface.web.url = undefined;
      if (project.surface.kind === 'web') {
        project.surface.active = false;
        project.surface.tabFocus = 'session';
      }
    }

    this.persist();
    this.emit('project-changed');
    this.emit('session-changed');
  }

  renameSession(projectId: string, sessionId: string, name: string, userRenamed?: boolean): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const session = project.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    session.name = name.slice(0, MAX_SESSION_NAME_LENGTH);
    if (userRenamed) session.userRenamed = true;
    // Keep history entry in sync if this session was resumed from history
    if (session.cliSessionId && project.sessionHistory) {
      const historyEntry = project.sessionHistory.find((a) => a.cliSessionId === session.cliSessionId);
      if (historyEntry) {
        historyEntry.name = session.name;
        this.emit('history-changed', project.id);
      }
    }
    this.persist();
    this.emit('session-changed');
  }

  setBrowserWidthRatio(projectId: string, ratio: number): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.layout.browserWidthRatio = clampRatio(ratio, 0.25, 0.7, DEFAULT_BROWSER_WIDTH_RATIO);
    this.persist();
    this.emit('layout-changed');
  }

  setMosaicRatio(projectId: string, key: string, ratio: number): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const next = { ...(project.layout.mosaicRatios ?? {}) };
    next[key] = clampRatio(ratio, 0.2, 0.8, next[key] ?? 0.5);
    project.layout.mosaicRatios = next;
    this.persist();
    this.emit('layout-changed');
  }

  cycleSession(direction: 1 | -1): void {
    const project = this.activeProject;
    if (!project || project.sessions.length === 0) return;
    const idx = project.sessions.findIndex((s) => s.id === project.activeSessionId);
    const next = (idx + direction + project.sessions.length) % project.sessions.length;
    project.activeSessionId = project.sessions[next].id;
    this.pushNav(project.activeSessionId);
    this.persist();
    this.emit('session-changed');
  }

  gotoSession(index: number): void {
    const project = this.activeProject;
    if (!project || index >= project.sessions.length) return;
    project.activeSessionId = project.sessions[index].id;
    this.pushNav(project.activeSessionId);
    this.persist();
    this.emit('session-changed');
  }

  removeAllSessions(projectId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const ids = project.sessions.map((s) => s.id);
    for (const id of ids) this.removeSession(projectId, id);
  }

  removeSessionsFromRight(projectId: string, sessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const idx = project.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return;
    const ids = project.sessions.slice(idx + 1).map((s) => s.id);
    for (const id of ids) this.removeSession(projectId, id);
  }

  removeSessionsFromLeft(projectId: string, sessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const idx = project.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return;
    const ids = project.sessions.slice(0, idx).map((s) => s.id);
    for (const id of ids) this.removeSession(projectId, id);
  }

  removeOtherSessions(projectId: string, sessionId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const ids = project.sessions.filter((s) => s.id !== sessionId).map((s) => s.id);
    for (const id of ids) this.removeSession(projectId, id);
  }

  addInsightSnapshot(projectId: string, snapshot: InitialContextSnapshot): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    addInsightSnapshotToProject(project, snapshot);
    this.persist();
    this.emit('insights-changed', projectId);
  }

  dismissInsight(projectId: string, insightId: string): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    dismissInsightForProject(project, insightId);
    this.persist();
    this.emit('insights-changed', projectId);
  }

  isInsightDismissed(projectId: string, insightId: string): boolean {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return false;
    return isInsightDismissedForProject(project, insightId);
  }

  reorderSession(projectId: string, sessionId: string, toIndex: number): void {
    const project = this.state.projects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!reorderProjectSession(project, sessionId, toIndex)) return;
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
