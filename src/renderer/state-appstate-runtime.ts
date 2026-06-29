import type {
  ProjectCheckpointDocument,
  ProjectCheckpointRestoreMode,
} from '../shared/types/project-checkpoint.js';
import type { ProjectRecord } from '../shared/types/project-state.js';
import type { ProjectWorkflowDocument } from '../shared/types/project-workflow.js';
import type { ProviderId } from '../shared/types/provider.js';
import type {
  ContextWindowInfo,
  CostInfo,
  InitialContextSnapshot,
  SessionRecord,
} from '../shared/types/session.js';
import {
  addInsightSnapshotForProject,
  addStandardProjectSession,
  addWorkflowLaunchSession,
  dismissInsightForProjectId,
  findSessionById,
  isInsightDismissedForProjectId,
  openUrlInProjectBrowserSurface,
  passivateBrowserTabSessionById,
  removeProjectSession,
  renameProjectSession,
  reorderSessionForProject,
  resolvePlanSessionConfig,
  restoreProjectCheckpointForState,
  resumeHistorySessionForProject,
  resumeWithProviderForProject,
  setBrowserWidthRatioForProject,
  setMosaicRatioForProject,
  setSurfaceTargetSessionForProject,
  updateBrowserTabSessionUrlById,
  updateProjectSessionCliId,
  upsertBrowserTabProjectSession,
} from './state-appstate-core.js';
import { setActiveProjectSession } from './state-surface-updater.js';

function findProjectById(projects: ProjectRecord[], projectId: string): ProjectRecord | undefined {
  return projects.find((project) => project.id === projectId);
}

export function addPlanSessionInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  name: string;
  providerOverride?: ProviderId;
  defaultProviderId?: ProviderId;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onSessionAdded: (session: SessionRecord) => void;
  onSessionChanged: () => void;
}): SessionRecord | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  const plan = resolvePlanSessionConfig({
    project,
    providerOverride: options.providerOverride,
    defaultProviderId: options.defaultProviderId,
  });
  return addSessionInAppState({
    projects: options.projects,
    projectId: options.projectId,
    name: options.name,
    args: plan.args,
    providerId: plan.providerId,
    defaultProviderId: options.defaultProviderId,
    pushNav: options.pushNav,
    persist: options.persist,
    onSessionAdded: options.onSessionAdded,
    onSessionChanged: options.onSessionChanged,
  });
}

export function launchWorkflowSessionInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  workflow: ProjectWorkflowDocument;
  providerOverride?: ProviderId;
  defaultProviderId?: ProviderId;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onSessionAdded: (session: SessionRecord) => void;
  onSessionChanged: () => void;
}): SessionRecord | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  const session = addWorkflowLaunchSession({
    project,
    workflow: options.workflow,
    providerOverride: options.providerOverride,
    defaultProviderId: options.defaultProviderId,
    pushNav: options.pushNav,
  });
  options.persist();
  options.onSessionAdded(session);
  options.onSessionChanged();
  return session;
}

export function addSessionInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  name: string;
  args?: string;
  providerId?: ProviderId;
  defaultProviderId?: ProviderId;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onSessionAdded: (session: SessionRecord) => void;
  onSessionChanged: () => void;
}): SessionRecord | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  const session = addStandardProjectSession({
    project,
    name: options.name,
    args: options.args,
    providerId: options.providerId,
    defaultProviderId: options.defaultProviderId,
    pushNav: options.pushNav,
  });
  options.persist();
  options.onSessionAdded(session);
  options.onSessionChanged();
  return session;
}

export function restoreProjectCheckpointInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  checkpoint: ProjectCheckpointDocument;
  mode: ProjectCheckpointRestoreMode;
  defaultProviderId: ProviderId;
  pruneNav: (sessionId: string) => void;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onSessionRemoved: (sessionId: string) => void;
  onSessionAdded: (session: SessionRecord) => void;
  onProjectChanged: () => void;
  onSessionChanged: () => void;
}): boolean {
  const result = restoreProjectCheckpointForState({
    projects: options.projects,
    projectId: options.projectId,
    checkpoint: options.checkpoint,
    mode: options.mode,
    defaultProviderId: options.defaultProviderId,
    pruneNav: options.pruneNav,
    pushNav: options.pushNav,
  });
  if (!result) return false;
  options.persist();
  for (const session of result.removedSessions) options.onSessionRemoved(session.id);
  for (const session of result.createdSessions) options.onSessionAdded(session);
  options.onProjectChanged();
  options.onSessionChanged();
  return true;
}

export function openUrlInBrowserSurfaceInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  url: string;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onSessionAdded: (session: SessionRecord) => void;
  onProjectChanged: () => void;
  onSessionChanged: () => void;
}): SessionRecord | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  const existingBrowserSession = openUrlInProjectBrowserSurface({
    project,
    url: options.url,
    pushNav: options.pushNav,
  });
  if (existingBrowserSession) {
    options.persist();
    options.onProjectChanged();
    options.onSessionChanged();
    return existingBrowserSession;
  }
  const result = upsertBrowserTabProjectSession({
    project,
    url: options.url,
    dedupeByUrl: true,
    pushNav: options.pushNav,
  });
  options.persist();
  if (result.created) options.onSessionAdded(result.session);
  options.onSessionChanged();
  return result.session;
}

export function removeSessionInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  sessionId: string;
  sessionHistoryEnabled: boolean;
  pruneNav: (sessionId: string) => void;
  pushNav: (sessionId: string) => void;
  onHistoryChanged: (projectId: string) => void;
  persist: () => void;
  onSessionRemoved: () => void;
  onSessionChanged: () => void;
}): boolean {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return false;
  removeProjectSession({
    project,
    sessionId: options.sessionId,
    sessionHistoryEnabled: options.sessionHistoryEnabled,
    pruneNav: options.pruneNav,
    pushNav: options.pushNav,
    onHistoryChanged: options.onHistoryChanged,
  });
  options.persist();
  options.onSessionRemoved();
  options.onSessionChanged();
  return true;
}

export function resumeFromHistoryInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  archivedSessionId: string;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onSessionAdded: (session: SessionRecord) => void;
  onSessionChanged: () => void;
}): SessionRecord | undefined {
  const result = resumeHistorySessionForProject({
    projects: options.projects,
    projectId: options.projectId,
    archivedSessionId: options.archivedSessionId,
    pushNav: options.pushNav,
  });
  if (!result) return undefined;
  options.persist();
  if (result.created) options.onSessionAdded(result.session);
  options.onSessionChanged();
  return result.session;
}

export async function resumeWithProviderInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  source: { archivedSessionId?: string; sessionId?: string };
  targetProviderId: ProviderId;
  pushNav: (sessionId: string) => void;
  buildResumePrompt: (
    sourceProviderId: ProviderId,
    sourceCliSessionId: string | null,
    projectPath: string,
    sourceName: string,
  ) => Promise<string>;
  persist: () => void;
  onSessionAdded: (session: SessionRecord) => void;
  onSessionChanged: () => void;
}): Promise<SessionRecord | undefined> {
  const session = await resumeWithProviderForProject({
    projects: options.projects,
    projectId: options.projectId,
    source: options.source,
    targetProviderId: options.targetProviderId,
    buildResumePrompt: options.buildResumePrompt,
    pushNav: options.pushNav,
  });
  if (!session) return undefined;
  options.persist();
  options.onSessionAdded(session);
  options.onSessionChanged();
  return session;
}

export function setActiveSessionInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  sessionId: string;
  pushNav: (sessionId: string) => void;
  persist: () => void;
  onProjectChanged: () => void;
  onSessionChanged: () => void;
}): boolean {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return false;
  options.pushNav(options.sessionId);
  const { surfaceChanged } = setActiveProjectSession(project, options.sessionId);
  options.persist();
  if (surfaceChanged) options.onProjectChanged();
  options.onSessionChanged();
  return true;
}

export function updateSessionCliIdInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  sessionId: string;
  cliSessionId: string;
  onHistoryChanged: (projectId: string) => void;
  persist: () => void;
  onCliSessionCleared: () => void;
  onSessionChanged: () => void;
}): boolean {
  const result = updateProjectSessionCliId({
    projects: options.projects,
    projectId: options.projectId,
    sessionId: options.sessionId,
    cliSessionId: options.cliSessionId,
    onHistoryChanged: options.onHistoryChanged,
  });
  if (!result.updated) return false;
  if (result.clearedPreviousCliSession) options.onCliSessionCleared();
  options.persist();
  options.onSessionChanged();
  return true;
}

export function renameSessionInAppState(options: {
  projects: ProjectRecord[];
  projectId: string;
  sessionId: string;
  name: string;
  userRenamed?: boolean;
  maxSessionNameLength: number;
  persist: () => void;
  onHistoryChanged: () => void;
  onSessionChanged: () => void;
}): boolean {
  const result = renameProjectSession({
    projects: options.projects,
    projectId: options.projectId,
    sessionId: options.sessionId,
    name: options.name,
    userRenamed: options.userRenamed,
    maxSessionNameLength: options.maxSessionNameLength,
  });
  if (!result.renamed) return false;
  if (result.historyRenamed) options.onHistoryChanged();
  options.persist();
  options.onSessionChanged();
  return true;
}

export function setSurfaceTargetSessionInAppState(
  projects: ProjectRecord[],
  projectId: string,
  targetSessionId: string | null,
  persist: () => void,
  onSessionChanged: () => void,
): boolean {
  if (!setSurfaceTargetSessionForProject(projects, projectId, targetSessionId)) return false;
  persist();
  onSessionChanged();
  return true;
}

export function updateSessionCostInAppState(
  projects: ProjectRecord[],
  sessionId: string,
  cost: CostInfo,
  persist: () => void,
): boolean {
  const session = findSessionById(projects, sessionId);
  if (!session) return false;
  session.cost = { ...cost };
  persist();
  return true;
}

export function updateSessionContextInAppState(
  projects: ProjectRecord[],
  sessionId: string,
  context: ContextWindowInfo,
  persist: () => void,
): boolean {
  const session = findSessionById(projects, sessionId);
  if (!session) return false;
  session.contextWindow = { ...context };
  persist();
  return true;
}

export function updateSessionBrowserTabUrlInAppState(
  projects: ProjectRecord[],
  sessionId: string,
  url: string,
  persist: () => void,
): boolean {
  if (!updateBrowserTabSessionUrlById(projects, sessionId, url)) return false;
  persist();
  return true;
}

export function passivateBrowserTabSessionInAppState(
  projects: ProjectRecord[],
  sessionId: string,
  failedUrl: string | undefined,
  persist: () => void,
  onProjectChanged: () => void,
  onSessionChanged: () => void,
): boolean {
  if (!passivateBrowserTabSessionById(projects, sessionId, failedUrl)) return false;
  persist();
  onProjectChanged();
  onSessionChanged();
  return true;
}

export function setBrowserWidthRatioInAppState(
  projects: ProjectRecord[],
  projectId: string,
  ratio: number,
  persist: () => void,
  onLayoutChanged: () => void,
): boolean {
  if (!setBrowserWidthRatioForProject(projects, projectId, ratio)) return false;
  persist();
  onLayoutChanged();
  return true;
}

export function setMosaicRatioInAppState(
  projects: ProjectRecord[],
  projectId: string,
  key: string,
  ratio: number,
  persist: () => void,
  onLayoutChanged: () => void,
): boolean {
  if (!setMosaicRatioForProject(projects, projectId, key, ratio)) return false;
  persist();
  onLayoutChanged();
  return true;
}

export function addInsightSnapshotInAppState(
  projects: ProjectRecord[],
  projectId: string,
  snapshot: InitialContextSnapshot,
  persist: () => void,
  onInsightsChanged: (projectId: string) => void,
): boolean {
  if (!addInsightSnapshotForProject(projects, projectId, snapshot)) return false;
  persist();
  onInsightsChanged(projectId);
  return true;
}

export function dismissInsightInAppState(
  projects: ProjectRecord[],
  projectId: string,
  insightId: string,
  persist: () => void,
  onInsightsChanged: (projectId: string) => void,
): boolean {
  if (!dismissInsightForProjectId(projects, projectId, insightId)) return false;
  persist();
  onInsightsChanged(projectId);
  return true;
}

export function isInsightDismissedInAppState(
  projects: ProjectRecord[],
  projectId: string,
  insightId: string,
): boolean {
  return isInsightDismissedForProjectId(projects, projectId, insightId);
}

export function reorderSessionInAppState(
  projects: ProjectRecord[],
  projectId: string,
  sessionId: string,
  toIndex: number,
  persist: () => void,
  onSessionChanged: () => void,
): boolean {
  if (!reorderSessionForProject(projects, projectId, sessionId, toIndex)) return false;
  persist();
  onSessionChanged();
  return true;
}
