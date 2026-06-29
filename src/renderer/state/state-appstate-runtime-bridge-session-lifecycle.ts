import type { ProjectCheckpointDocument, ProjectCheckpointRestoreMode } from '../../shared/types/project-checkpoint.js';
import type { ProjectWorkflowDocument } from '../../shared/types/project-workflow.js';
import type { ProviderId } from '../../shared/types/provider.js';
import type { SessionRecord } from '../../shared/types/session.js';
import {
  addMcpInspectorProjectSession,
  addRemoteProjectSession,
  upsertBrowserTabProjectSession,
  upsertDiffViewerProjectSession,
  upsertFileReaderProjectSession,
} from '../state-appstate-core.js';
import {
  addPlanSessionInAppState,
  addSessionInAppState,
  launchWorkflowSessionInAppState,
  openUrlInBrowserSurfaceInAppState,
  removeSessionInAppState,
  restoreProjectCheckpointInAppState,
  resumeFromHistoryInAppState,
  resumeWithProviderInAppState,
  setActiveSessionInAppState,
  setSurfaceTargetSessionInAppState,
} from '../state-appstate-runtime.js';
import type { AppStateRuntimeBridge } from './state-appstate-runtime-bridge-types.js';
import {
  addOrUpdateSessionWithBridge,
  emitSessionAdded,
} from './state-appstate-runtime-bridge-utils.js';

export function restoreProjectCheckpointWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  checkpoint: ProjectCheckpointDocument,
  mode: ProjectCheckpointRestoreMode,
): void {
  restoreProjectCheckpointInAppState({
    projects: bridge.projects,
    projectId,
    checkpoint,
    mode,
    defaultProviderId: bridge.defaultProviderId ?? 'claude',
    pruneNav: bridge.pruneNav,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onSessionRemoved: (sessionId) => bridge.emit('session-removed', { projectId, sessionId }),
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onProjectChanged: () => bridge.emit('project-changed'),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function addPlanSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  name: string,
  providerOverride?: ProviderId,
): SessionRecord | undefined {
  return addPlanSessionInAppState({
    projects: bridge.projects,
    projectId,
    name,
    providerOverride,
    defaultProviderId: bridge.defaultProviderId,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function launchWorkflowSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  workflow: ProjectWorkflowDocument,
  providerOverride?: ProviderId,
): SessionRecord | undefined {
  return launchWorkflowSessionInAppState({
    projects: bridge.projects,
    projectId,
    workflow,
    providerOverride,
    defaultProviderId: bridge.defaultProviderId,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function addSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  name: string,
  args?: string,
  providerId?: ProviderId,
): SessionRecord | undefined {
  return addSessionInAppState({
    projects: bridge.projects,
    projectId,
    name,
    args,
    providerId,
    defaultProviderId: bridge.defaultProviderId,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function addDiffViewerSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  filePath: string,
  area: string,
  worktreePath?: string,
): SessionRecord | undefined {
  return addOrUpdateSessionWithBridge(bridge, projectId, (project) =>
    upsertDiffViewerProjectSession({
      project,
      filePath,
      area,
      worktreePath,
      pushNav: bridge.pushNav,
    }));
}

export function addRemoteSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  sessionId: string,
  hostSessionName: string,
  shareMode: 'readonly' | 'readwrite',
): SessionRecord | undefined {
  return addOrUpdateSessionWithBridge(bridge, projectId, (project) => ({
    session: addRemoteProjectSession({
      project,
      sessionId,
      hostSessionName,
      shareMode,
      pushNav: bridge.pushNav,
    }),
    created: true,
  }));
}

export function addBrowserTabSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  url?: string,
  dedupeByUrl = true,
): SessionRecord | undefined {
  return addOrUpdateSessionWithBridge(bridge, projectId, (project) =>
    upsertBrowserTabProjectSession({
      project,
      url,
      dedupeByUrl,
      pushNav: bridge.pushNav,
    }));
}

export function addFileReaderSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  filePath: string,
  lineNumber?: number,
): SessionRecord | undefined {
  return addOrUpdateSessionWithBridge(bridge, projectId, (project) =>
    upsertFileReaderProjectSession({
      project,
      filePath,
      lineNumber,
      pushNav: bridge.pushNav,
    }));
}

export function addMcpInspectorSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  name: string,
): SessionRecord | undefined {
  return addOrUpdateSessionWithBridge(bridge, projectId, (project) => ({
    session: addMcpInspectorProjectSession({
      project,
      name,
      pushNav: bridge.pushNav,
    }),
    created: true,
  }));
}

export function openUrlInBrowserSurfaceWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  url: string,
): SessionRecord | undefined {
  return openUrlInBrowserSurfaceInAppState({
    projects: bridge.projects,
    projectId,
    url,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onProjectChanged: () => bridge.emit('project-changed'),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function removeSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  sessionId: string,
): void {
  removeSessionInAppState({
    projects: bridge.projects,
    projectId,
    sessionId,
    sessionHistoryEnabled: bridge.sessionHistoryEnabled,
    pruneNav: bridge.pruneNav,
    pushNav: bridge.pushNav,
    onHistoryChanged: (historyProjectId) => bridge.emit('history-changed', historyProjectId),
    persist: bridge.persist,
    onSessionRemoved: () => bridge.emit('session-removed', { projectId, sessionId }),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function resumeFromHistoryWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  archivedSessionId: string,
): SessionRecord | undefined {
  return resumeFromHistoryInAppState({
    projects: bridge.projects,
    projectId,
    archivedSessionId,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export async function resumeWithProviderWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  source: { archivedSessionId?: string; sessionId?: string },
  targetProviderId: ProviderId,
): Promise<SessionRecord | undefined> {
  return resumeWithProviderInAppState({
    projects: bridge.projects,
    projectId,
    source,
    targetProviderId,
    buildResumePrompt: bridge.buildResumePrompt,
    pushNav: bridge.pushNav,
    // persist() strips pendingInitialPrompt (transient). split-layout.onSessionAdded
    // will consume it synchronously from in-memory state before the next persist.
    persist: bridge.persist,
    onSessionAdded: emitSessionAdded(bridge, projectId),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function setActiveSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  sessionId: string,
): void {
  setActiveSessionInAppState({
    projects: bridge.projects,
    projectId,
    sessionId,
    pushNav: bridge.pushNav,
    persist: bridge.persist,
    onProjectChanged: () => bridge.emit('project-changed'),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function setSurfaceTargetSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  targetSessionId: string | null,
): void {
  setSurfaceTargetSessionInAppState(
    bridge.projects,
    projectId,
    targetSessionId,
    bridge.persist,
    () => bridge.emit('session-changed'),
  );
}
