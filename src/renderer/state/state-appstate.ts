import type {
  ProjectCheckpointDocument,
  ProjectCheckpointRestoreMode,
} from '../../shared/types/project-checkpoint.js';
import type { ProjectWorkflowDocument } from '../../shared/types/project-workflow.js';
import type { ProviderId } from '../../shared/types/provider.js';
import type {
  ArchivedSession,
  ContextWindowInfo,
  CostInfo,
  InitialContextSnapshot,
  SessionRecord,
} from '../../shared/types/session.js';
import {
  clearHistoryForProject,
  findProjectBySessionId,
  findSessionById,
  isInsightDismissedInAppState,
  listSurfaceTargetSessionsForProject,
  removeHistoryEntryForProject,
  resolveSurfaceTargetSessionForProject,
  toggleHistoryBookmarkForProject,
} from '../state-appstate-extracts.js';
import { AppStateBase } from './state-appstate-base.js';
import {
  addBrowserTabSessionWithBridge,
  addDiffViewerSessionWithBridge,
  addFileReaderSessionWithBridge,
  addInsightSnapshotWithBridge,
  addMcpInspectorSessionWithBridge,
  addPlanSessionWithBridge,
  addSessionWithBridge,
  dismissInsightWithBridge,
  launchWorkflowSessionWithBridge,
  openUrlInBrowserSurfaceWithBridge,
  passivateBrowserTabSessionWithBridge,
  removeSessionWithBridge,
  renameSessionWithBridge,
  reorderSessionWithBridge,
  restoreProjectCheckpointWithBridge,
  resumeFromHistoryWithBridge,
  resumeWithProviderWithBridge,
  setActiveSessionWithBridge,
  setBrowserWidthRatioWithBridge,
  setMosaicRatioWithBridge,
  setSurfaceTargetSessionWithBridge,
  updateSessionBrowserTabUrlWithBridge,
  updateSessionCliIdWithBridge,
  updateSessionContextWithBridge,
  updateSessionCostWithBridge,
} from './state-appstate-runtime-bridge.js';
import type { SessionRemovalScope } from './state-contracts.js';
import {
  collectProjectSessionIdsForScope,
  consumePendingInitialPromptFromState,
  cycleActiveProjectSession,
  gotoProjectSession,
} from './state-project-session-helpers.js';

export const MAX_SESSION_NAME_LENGTH = 60;

export class AppState extends AppStateBase {
  restoreProjectCheckpoint(
    projectId: string,
    checkpoint: ProjectCheckpointDocument,
    mode: ProjectCheckpointRestoreMode = 'additive',
  ): void {
    restoreProjectCheckpointWithBridge(this.runtimeBridge(), projectId, checkpoint, mode);
  }

  addPlanSession(
    projectId: string,
    name: string,
    providerOverride?: ProviderId,
  ): SessionRecord | undefined {
    return addPlanSessionWithBridge(this.runtimeBridge(), projectId, name, providerOverride);
  }
  launchWorkflowSession(
    projectId: string,
    workflow: ProjectWorkflowDocument,
    providerOverride?: ProviderId,
  ): SessionRecord | undefined {
    return launchWorkflowSessionWithBridge(
      this.runtimeBridge(),
      projectId,
      workflow,
      providerOverride,
    );
  }
  addSession(
    projectId: string,
    name: string,
    args?: string,
    providerId?: ProviderId,
  ): SessionRecord | undefined {
    return addSessionWithBridge(this.runtimeBridge(), projectId, name, args, providerId);
  }
  addDiffViewerSession(
    projectId: string,
    filePath: string,
    area: string,
    worktreePath?: string,
  ): SessionRecord | undefined {
    return addDiffViewerSessionWithBridge(
      this.runtimeBridge(),
      projectId,
      filePath,
      area,
      worktreePath,
    );
  }
  addBrowserTabSession(
    projectId: string,
    url?: string,
    options?: { dedupeByUrl?: boolean },
  ): SessionRecord | undefined {
    return addBrowserTabSessionWithBridge(
      this.runtimeBridge(),
      projectId,
      url,
      options?.dedupeByUrl ?? true,
    );
  }
  openUrlInBrowserSurface(projectId: string, url: string): SessionRecord | undefined {
    return openUrlInBrowserSurfaceWithBridge(this.runtimeBridge(), projectId, url);
  }
  addFileReaderSession(
    projectId: string,
    filePath: string,
    lineNumber?: number,
  ): SessionRecord | undefined {
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
    renameSessionWithBridge(
      this.runtimeBridge(),
      projectId,
      sessionId,
      name,
      MAX_SESSION_NAME_LENGTH,
      userRenamed,
    );
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
    this.pushNav(nextSessionId);
    this.persist();
    this.emit('session-changed');
  }
  gotoSession(index: number): void {
    const nextSessionId = gotoProjectSession(this.activeProject, index);
    if (!nextSessionId) return;
    this.pushNav(nextSessionId);
    this.persist();
    this.emit('session-changed');
  }

  private removeSessionsByScope(
    projectId: string,
    scope: SessionRemovalScope,
    anchorSessionId?: string,
  ): void {
    const project = this.state.projects.find((p) => p.id === projectId);
    const ids = collectProjectSessionIdsForScope(project, scope, anchorSessionId);
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
}

type AppStateHandle = {
  flushPendingEventsForUnload(): void;
  resetForTesting(): void;
};

let appStateSingleton: AppStateHandle | null = null;

function initializeAppStateSingleton(state: AppState): AppState {
  appStateSingleton = state;
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      appStateSingleton?.flushPendingEventsForUnload();
    });
  }
  return state;
}

function _resetAppStateSingletonForTesting(): void {
  appStateSingleton?.resetForTesting();
}

export const appState = initializeAppStateSingleton(new AppState());

export function createAppState(): AppState {
  return new AppState();
}

export function getAppState(): AppState {
  return appState;
}

/** @internal Test-only: reset all module state */
export function _resetForTesting(): void {
  _resetAppStateSingletonForTesting();
}
