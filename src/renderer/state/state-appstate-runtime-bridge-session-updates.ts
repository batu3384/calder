import type {
  ContextWindowInfo,
  CostInfo,
  InitialContextSnapshot,
} from '../../shared/types/session.js';
import {
  addInsightSnapshotInAppState,
  dismissInsightInAppState,
  passivateBrowserTabSessionInAppState,
  renameSessionInAppState,
  reorderSessionInAppState,
  setBrowserWidthRatioInAppState,
  setMosaicRatioInAppState,
  updateSessionBrowserTabUrlInAppState,
  updateSessionCliIdInAppState,
  updateSessionContextInAppState,
  updateSessionCostInAppState,
} from '../state-appstate-runtime.js';
import type { AppStateRuntimeBridge } from './state-appstate-runtime-bridge-types.js';

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
  setBrowserWidthRatioInAppState(bridge.projects, projectId, ratio, bridge.persist, () =>
    bridge.emit('layout-changed'),
  );
}

export function setMosaicRatioWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  key: string,
  ratio: number,
): void {
  setMosaicRatioInAppState(bridge.projects, projectId, key, ratio, bridge.persist, () =>
    bridge.emit('layout-changed'),
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
  reorderSessionInAppState(bridge.projects, projectId, sessionId, toIndex, bridge.persist, () =>
    bridge.emit('session-changed'),
  );
}
