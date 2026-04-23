import type { ProviderId } from '../../shared/types/provider.js';
import type {
  ProjectCheckpointDocument,
  ProjectCheckpointRestoreMode,
  ProjectRecord,
  ProjectWorkflowDocument,
} from '../../shared/types/project.js';
import type { ContextWindowInfo, CostInfo, InitialContextSnapshot, SessionRecord } from '../../shared/types/session.js';
import type { EventType } from './state-contracts.js';
import {
  addInsightSnapshotInAppState,
  addPlanSessionInAppState,
  addSessionInAppState,
  dismissInsightInAppState,
  launchWorkflowSessionInAppState,
  openUrlInBrowserSurfaceInAppState,
  passivateBrowserTabSessionInAppState,
  removeSessionInAppState,
  renameSessionInAppState,
  reorderSessionInAppState,
  resumeFromHistoryInAppState,
  resumeWithProviderInAppState,
  restoreProjectCheckpointInAppState,
  setActiveSessionInAppState,
  setBrowserWidthRatioInAppState,
  setMosaicRatioInAppState,
  setSurfaceTargetSessionInAppState,
  updateSessionBrowserTabUrlInAppState,
  updateSessionCliIdInAppState,
  updateSessionContextInAppState,
  updateSessionCostInAppState,
} from '../state-appstate-extracts.js';

type BuildResumePrompt = (
  sourceProviderId: ProviderId,
  sourceCliSessionId: string | null,
  projectPath: string,
  sourceName: string,
) => Promise<string>;

export interface AppStateRuntimeBridge {
  projects: ProjectRecord[];
  defaultProviderId?: ProviderId;
  sessionHistoryEnabled: boolean;
  pushNav: (sessionId: string) => void;
  pruneNav: (sessionId: string) => void;
  persist: () => void;
  emit: (event: EventType, data?: unknown) => void;
  buildResumePrompt: BuildResumePrompt;
}

function emitSessionAdded(
  bridge: AppStateRuntimeBridge,
  projectId: string,
): (session: SessionRecord) => void {
  return (session: SessionRecord) => bridge.emit('session-added', { projectId, session });
}

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

export function updateSessionCliIdWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  sessionId: string,
  cliSessionId: string,
): void {
  updateSessionCliIdInAppState({
    projects: bridge.projects,
    projectId,
    sessionId,
    cliSessionId,
    onHistoryChanged: (historyProjectId) => bridge.emit('history-changed', historyProjectId),
    persist: bridge.persist,
    onCliSessionCleared: () => bridge.emit('cli-session-cleared', { sessionId }),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function updateSessionCostWithBridge(
  bridge: AppStateRuntimeBridge,
  sessionId: string,
  cost: CostInfo,
): void {
  updateSessionCostInAppState(bridge.projects, sessionId, cost, bridge.persist);
}

export function updateSessionContextWithBridge(
  bridge: AppStateRuntimeBridge,
  sessionId: string,
  context: ContextWindowInfo,
): void {
  updateSessionContextInAppState(bridge.projects, sessionId, context, bridge.persist);
}

export function updateSessionBrowserTabUrlWithBridge(
  bridge: AppStateRuntimeBridge,
  sessionId: string,
  url: string,
): void {
  updateSessionBrowserTabUrlInAppState(bridge.projects, sessionId, url, bridge.persist);
}

export function passivateBrowserTabSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  sessionId: string,
  failedUrl?: string,
): void {
  passivateBrowserTabSessionInAppState(
    bridge.projects,
    sessionId,
    failedUrl,
    bridge.persist,
    () => bridge.emit('project-changed'),
    () => bridge.emit('session-changed'),
  );
}

export function renameSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  sessionId: string,
  name: string,
  maxSessionNameLength: number,
  userRenamed?: boolean,
): void {
  renameSessionInAppState({
    projects: bridge.projects,
    projectId,
    sessionId,
    name,
    userRenamed,
    maxSessionNameLength,
    persist: bridge.persist,
    onHistoryChanged: () => bridge.emit('history-changed', projectId),
    onSessionChanged: () => bridge.emit('session-changed'),
  });
}

export function setBrowserWidthRatioWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  ratio: number,
): void {
  setBrowserWidthRatioInAppState(
    bridge.projects,
    projectId,
    ratio,
    bridge.persist,
    () => bridge.emit('layout-changed'),
  );
}

export function setMosaicRatioWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  key: string,
  ratio: number,
): void {
  setMosaicRatioInAppState(
    bridge.projects,
    projectId,
    key,
    ratio,
    bridge.persist,
    () => bridge.emit('layout-changed'),
  );
}

export function addInsightSnapshotWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  snapshot: InitialContextSnapshot,
): void {
  addInsightSnapshotInAppState(
    bridge.projects,
    projectId,
    snapshot,
    bridge.persist,
    (targetProjectId) => bridge.emit('insights-changed', targetProjectId),
  );
}

export function dismissInsightWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  insightId: string,
): void {
  dismissInsightInAppState(
    bridge.projects,
    projectId,
    insightId,
    bridge.persist,
    (targetProjectId) => bridge.emit('insights-changed', targetProjectId),
  );
}

export function reorderSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  sessionId: string,
  toIndex: number,
): void {
  reorderSessionInAppState(
    bridge.projects,
    projectId,
    sessionId,
    toIndex,
    bridge.persist,
    () => bridge.emit('session-changed'),
  );
}
