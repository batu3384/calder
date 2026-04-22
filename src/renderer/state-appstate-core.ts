import type { ProviderId } from '../shared/types/provider.js';
import type {
  PersistedState,
  ProjectCheckpointDocument,
  ProjectCheckpointRestoreMode,
  ProjectRecord,
  ProjectWorkflowDocument,
} from '../shared/types/project.js';
import type { InitialContextSnapshot, SessionRecord } from '../shared/types/session.js';
import { clampRatio } from './components/mosaic-layout-model.js';
import { getProviderCapabilities, getProviderAvailabilitySnapshot } from './provider-availability.js';
import { appendProjectGovernanceToPrompt } from './project-governance-prompt.js';
import { appendProjectTeamContextToPrompt } from './project-team-context-prompt.js';
import { getCost } from './session-cost.js';
import {
  archiveSessionToHistory,
  clearProjectHistory,
  removeHistoryEntryFromProject,
  resumeSessionFromHistory,
  toggleProjectHistoryBookmark,
} from './state-history.js';
import { restoreProjectCheckpointState } from './state-checkpoint-restore.js';
import { addInsightSnapshotToProject, dismissInsightForProject, isInsightDismissedForProject, reorderProjectSession } from './state-session-mutators.js';
import { DEFAULT_BROWSER_WIDTH_RATIO, buildWorkflowLaunchPrompt, normalizeProjectLayout } from './state-normalizers.js';
import { isCliSessionRecord, repairProjectSurface, resolveSurfaceTargetFromProject } from './state-project-surface.js';
import { resumeProjectWithProvider } from './state-resume-with-provider.js';
import { createStandardSessionRecord, createWorkflowLaunchSessionRecord } from './state-session-factory.js';
import {
  addMcpInspectorSession as addMcpInspectorSessionToProject,
  addRemoteSession as addRemoteSessionToProject,
  addSessionToProject,
  openUrlInExistingBrowserSession,
  passivateBrowserTabSession as passivateBrowserTabSessionRecord,
  setSurfaceTargetSession as setSurfaceTargetSessionOnProject,
  updateBrowserTabUrl,
  upsertBrowserTabSession,
  upsertDiffViewerSession,
  upsertFileReaderSession,
} from './state-session-ops.js';

function findProjectById(projects: ProjectRecord[], projectId: string): ProjectRecord | undefined {
  return projects.find((project) => project.id === projectId);
}

export function findProjectBySessionId(projects: ProjectRecord[], sessionId: string): ProjectRecord | undefined {
  return projects.find((project) => project.sessions.some((session) => session.id === sessionId));
}

export function findSessionById(projects: ProjectRecord[], sessionId: string): SessionRecord | undefined {
  for (const project of projects) {
    const session = project.sessions.find((entry) => entry.id === sessionId);
    if (session) return session;
  }
  return undefined;
}

export function createProjectRecord(name: string, path: string): ProjectRecord {
  return {
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
}

export function removeProjectAndCollectSessions(state: PersistedState, projectId: string): SessionRecord[] {
  const project = findProjectById(state.projects, projectId);
  const sessions = project?.sessions ?? [];
  state.projects = state.projects.filter((entry) => entry.id !== projectId);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[0]?.id ?? null;
  }
  return sessions;
}

export function resolvePlanSessionConfig(options: {
  project: ProjectRecord;
  providerOverride?: ProviderId;
  defaultProviderId?: ProviderId;
}): { providerId: ProviderId; args?: string } {
  const { project, providerOverride, defaultProviderId } = options;
  const activeSession = project.sessions.find((session) => session.id === project.activeSessionId);
  const providerId = providerOverride ?? defaultProviderId ?? activeSession?.providerId ?? 'claude';
  const caps = getProviderCapabilities(providerId);
  const planArg = caps?.planModeArg ?? '';
  const base = project.defaultArgs ?? '';
  const args = [base, planArg].filter(Boolean).join(' ').trim() || undefined;
  return { providerId, args };
}


export function addWorkflowLaunchSession(options: {
  project: ProjectRecord;
  workflow: ProjectWorkflowDocument;
  providerOverride?: ProviderId;
  defaultProviderId?: ProviderId;
  pushNav: (sessionId: string) => void;
}): SessionRecord {
  const { project, workflow, providerOverride, defaultProviderId, pushNav } = options;
  const session = createWorkflowLaunchSessionRecord({
    name: workflow.title,
    providerId: providerOverride ?? defaultProviderId ?? 'claude',
    args: project.defaultArgs,
    pendingInitialPrompt: appendProjectGovernanceToPrompt(
      appendProjectTeamContextToPrompt(buildWorkflowLaunchPrompt(workflow), project.projectTeamContext),
      project.projectGovernance,
    ),
  });
  addSessionToProject(project, session, pushNav, { includeInMosaic: true });
  return session;
}


export function addStandardProjectSession(options: {
  project: ProjectRecord;
  name: string;
  args?: string;
  providerId?: ProviderId;
  defaultProviderId?: ProviderId;
  pushNav: (sessionId: string) => void;
}): SessionRecord {
  const { project, name, args, providerId, defaultProviderId, pushNav } = options;
  const effectiveArgs = args ?? project.defaultArgs;
  const session = createStandardSessionRecord({
    name,
    providerId: providerId ?? defaultProviderId ?? 'claude',
    args: effectiveArgs,
  });
  addSessionToProject(project, session, pushNav, { includeInMosaic: true });
  return session;
}


export function upsertDiffViewerProjectSession(options: {
  project: ProjectRecord;
  filePath: string;
  area: string;
  worktreePath?: string;
  pushNav: (sessionId: string) => void;
}): { session: SessionRecord; created: boolean } {
  return upsertDiffViewerSession(
    options.project,
    { filePath: options.filePath, area: options.area, worktreePath: options.worktreePath },
    options.pushNav,
  );
}

export function addRemoteProjectSession(options: {
  project: ProjectRecord;
  sessionId: string;
  hostSessionName: string;
  shareMode: 'readonly' | 'readwrite';
  pushNav: (sessionId: string) => void;
}): SessionRecord {
  return addRemoteSessionToProject(
    options.project,
    { sessionId: options.sessionId, hostSessionName: options.hostSessionName, shareMode: options.shareMode },
    options.pushNav,
  );
}

export function upsertBrowserTabProjectSession(options: {
  project: ProjectRecord;
  url?: string;
  dedupeByUrl?: boolean;
  pushNav: (sessionId: string) => void;
}): { session: SessionRecord; created: boolean } {
  return upsertBrowserTabSession(
    options.project,
    { url: options.url, dedupeByUrl: options.dedupeByUrl ?? true },
    options.pushNav,
  );
}

export function openUrlInProjectBrowserSurface(options: {
  project: ProjectRecord;
  url: string;
  pushNav: (sessionId: string) => void;
}): SessionRecord | undefined {
  return openUrlInExistingBrowserSession(options.project, options.url, options.pushNav);
}

export function upsertFileReaderProjectSession(options: {
  project: ProjectRecord;
  filePath: string;
  lineNumber?: number;
  pushNav: (sessionId: string) => void;
}): { session: SessionRecord; created: boolean } {
  return upsertFileReaderSession(
    options.project,
    { filePath: options.filePath, lineNumber: options.lineNumber },
    options.pushNav,
  );
}

export function addMcpInspectorProjectSession(options: {
  project: ProjectRecord;
  name: string;
  pushNav: (sessionId: string) => void;
}): SessionRecord {
  return addMcpInspectorSessionToProject(options.project, options.name, options.pushNav);
}

export function restoreProjectCheckpointForState(options: {
  projects: ProjectRecord[];
  projectId: string;
  checkpoint: ProjectCheckpointDocument;
  mode: ProjectCheckpointRestoreMode;
  defaultProviderId: ProviderId;
  pruneNav: (sessionId: string) => void;
  pushNav: (sessionId: string) => void;
}): { createdSessions: SessionRecord[]; removedSessions: SessionRecord[] } | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  return restoreProjectCheckpointState({
    project,
    checkpoint: options.checkpoint,
    mode: options.mode,
    defaultProviderId: options.defaultProviderId,
    pruneNav: options.pruneNav,
    pushNav: options.pushNav,
  });
}

export function removeProjectSession(options: {
  project: ProjectRecord;
  sessionId: string;
  sessionHistoryEnabled: boolean;
  pruneNav: (sessionId: string) => void;
  pushNav: (sessionId: string) => void;
  onHistoryChanged: (projectId: string) => void;
}): void {
  const { project, sessionId, sessionHistoryEnabled, pruneNav, pushNav, onHistoryChanged } = options;

  // Archive CLI sessions before removing (cost data must be captured before session-removed triggers destroyTerminal)
  const session = project.sessions.find((entry) => entry.id === sessionId);
  if (session && (!session.type || session.type === 'claude') && sessionHistoryEnabled) {
    // Skip archiving empty sessions (no CLI activity)
    if (session.cliSessionId || getCost(session.id) !== null) {
      archiveSessionToHistory(project, session, getCost(session.id));
      onHistoryChanged(project.id);
    }
  }

  const closingIndex = project.sessions.findIndex((entry) => entry.id === sessionId);
  project.sessions = project.sessions.filter((entry) => entry.id !== sessionId);
  pruneNav(sessionId);
  if (project.activeSessionId === sessionId) {
    const newIndex = closingIndex > 0 ? closingIndex - 1 : 0;
    project.activeSessionId = project.sessions[newIndex]?.id ?? null;
    if (project.activeSessionId) pushNav(project.activeSessionId);
  }
  repairProjectSurface(project);
  // Keep the mosaic pane list in sync with removed sessions.
  project.layout.splitPanes = project.layout.splitPanes.filter((id) => id !== sessionId);
}

export async function resumeWithProviderForProject(options: {
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
}): Promise<SessionRecord | undefined> {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;

  // Defense-in-depth: UI gates this by availability, but bail if the target
  // provider isn't actually installed so we don't create a broken session.
  const snapshot = getProviderAvailabilitySnapshot();
  if (snapshot && snapshot.availability.get(options.targetProviderId) === false) {
    return undefined;
  }

  return resumeProjectWithProvider({
    project,
    source: options.source,
    targetProviderId: options.targetProviderId,
    buildResumePrompt: options.buildResumePrompt,
    pushNav: options.pushNav,
  });
}

export function updateProjectSessionCliId(options: {
  projects: ProjectRecord[];
  projectId: string;
  sessionId: string;
  cliSessionId: string;
  onHistoryChanged: (projectId: string) => void;
}): { updated: boolean; clearedPreviousCliSession: boolean } {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return { updated: false, clearedPreviousCliSession: false };
  const session = project.sessions.find((entry) => entry.id === options.sessionId);
  if (!session) return { updated: false, clearedPreviousCliSession: false };

  let clearedPreviousCliSession = false;
  // If session already had a different cliSessionId (e.g., /clear was used),
  // archive the previous session and reset the tab name
  if (session.cliSessionId && session.cliSessionId !== options.cliSessionId) {
    archiveSessionToHistory(project, session, getCost(session.id));
    options.onHistoryChanged(project.id);
    session.name = `Session ${project.sessions.length + (project.sessionHistory?.length || 0)}`;
    session.userRenamed = false;
    clearedPreviousCliSession = true;
  }

  session.cliSessionId = options.cliSessionId;
  return { updated: true, clearedPreviousCliSession };
}

export function renameProjectSession(options: {
  projects: ProjectRecord[];
  projectId: string;
  sessionId: string;
  name: string;
  userRenamed?: boolean;
  maxSessionNameLength: number;
}): { renamed: boolean; historyRenamed: boolean } {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return { renamed: false, historyRenamed: false };
  const session = project.sessions.find((entry) => entry.id === options.sessionId);
  if (!session) return { renamed: false, historyRenamed: false };

  session.name = options.name.slice(0, options.maxSessionNameLength);
  if (options.userRenamed) session.userRenamed = true;

  // Keep history entry in sync if this session was resumed from history
  if (session.cliSessionId && project.sessionHistory) {
    const historyEntry = project.sessionHistory.find((entry) => entry.cliSessionId === session.cliSessionId);
    if (historyEntry) {
      historyEntry.name = session.name;
      return { renamed: true, historyRenamed: true };
    }
  }

  return { renamed: true, historyRenamed: false };
}

export function removeHistoryEntryForProject(
  projects: ProjectRecord[],
  projectId: string,
  archivedSessionId: string,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project?.sessionHistory) return false;
  removeHistoryEntryFromProject(project, archivedSessionId);
  return true;
}

export function toggleHistoryBookmarkForProject(
  projects: ProjectRecord[],
  projectId: string,
  archivedSessionId: string,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  return toggleProjectHistoryBookmark(project, archivedSessionId);
}

export function clearHistoryForProject(projects: ProjectRecord[], projectId: string): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  clearProjectHistory(project);
  return true;
}

export function resumeHistorySessionForProject(options: {
  projects: ProjectRecord[];
  projectId: string;
  archivedSessionId: string;
  pushNav: (sessionId: string) => void;
}): { session: SessionRecord; created: boolean } | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  const result = resumeSessionFromHistory(project, options.archivedSessionId, options.pushNav);
  if (!result.session) return undefined;
  return { session: result.session, created: result.created };
}

export function listSurfaceTargetSessionsForProject(
  projects: ProjectRecord[],
  projectId: string,
): SessionRecord[] {
  const project = findProjectById(projects, projectId);
  if (!project) return [];
  return project.sessions.filter((session) => isCliSessionRecord(session));
}

export function resolveSurfaceTargetSessionForProject(options: {
  projects: ProjectRecord[];
  projectId: string;
  requireExplicitTarget?: boolean;
}): SessionRecord | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  return resolveSurfaceTargetFromProject(project, {
    allowActiveFallback: options.requireExplicitTarget ? false : true,
  });
}

export function setSurfaceTargetSessionForProject(
  projects: ProjectRecord[],
  projectId: string,
  targetSessionId: string | null,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  return setSurfaceTargetSessionOnProject(project, targetSessionId);
}

export function updateBrowserTabSessionUrlById(
  projects: ProjectRecord[],
  sessionId: string,
  url: string,
): boolean {
  const project = projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  const session = project?.sessions.find((entry) => entry.id === sessionId);
  if (!session) return false;
  return updateBrowserTabUrl(project, session, url);
}

export function passivateBrowserTabSessionById(
  projects: ProjectRecord[],
  sessionId: string,
  failedUrl?: string,
): boolean {
  const project = projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  const session = project?.sessions.find((entry) => entry.id === sessionId);
  if (!project || !session) return false;
  return passivateBrowserTabSessionRecord(project, session, failedUrl);
}

export function setBrowserWidthRatioForProject(
  projects: ProjectRecord[],
  projectId: string,
  ratio: number,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  project.layout.browserWidthRatio = clampRatio(ratio, 0.25, 0.7, DEFAULT_BROWSER_WIDTH_RATIO);
  return true;
}

export function setMosaicRatioForProject(
  projects: ProjectRecord[],
  projectId: string,
  key: string,
  ratio: number,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  const next = { ...(project.layout.mosaicRatios ?? {}) };
  next[key] = clampRatio(ratio, 0.2, 0.8, next[key] ?? 0.5);
  project.layout.mosaicRatios = next;
  return true;
}

export function addInsightSnapshotForProject(
  projects: ProjectRecord[],
  projectId: string,
  snapshot: InitialContextSnapshot,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  addInsightSnapshotToProject(project, snapshot);
  return true;
}

export function dismissInsightForProjectId(
  projects: ProjectRecord[],
  projectId: string,
  insightId: string,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  dismissInsightForProject(project, insightId);
  return true;
}

export function isInsightDismissedForProjectId(
  projects: ProjectRecord[],
  projectId: string,
  insightId: string,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  return isInsightDismissedForProject(project, insightId);
}

export function reorderSessionForProject(
  projects: ProjectRecord[],
  projectId: string,
  sessionId: string,
  toIndex: number,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  return reorderProjectSession(project, sessionId, toIndex);
}
