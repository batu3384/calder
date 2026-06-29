import type { PersistedState, ProjectRecord } from '../../shared/types/project-state.js';
import type { SessionRecord } from '../../shared/types/session.js';
import {
  createProjectRecord,
  removeProjectAndCollectSessions,
} from '../state-appstate-extracts.js';
import {
  collectSessionIdsForRemoval,
  resolveCycledSessionId,
  resolveSessionIdAtIndex,
} from '../state-session-navigation.js';
import type { SessionRemovalScope } from './state-contracts.js';

export function addProjectToState(
  state: PersistedState,
  name: string,
  path: string,
): ProjectRecord {
  const project = createProjectRecord(name, path);
  state.projects.push(project);
  state.activeProjectId = project.id;
  return project;
}

export function removeProjectFromState(state: PersistedState, projectId: string): SessionRecord[] {
  return removeProjectAndCollectSessions(state, projectId);
}

export function consumePendingInitialPromptFromState(
  state: PersistedState,
  projectId: string,
  sessionId: string,
): string | undefined {
  const project = state.projects.find((p) => p.id === projectId);
  const session = project?.sessions.find((s) => s.id === sessionId);
  if (!session?.pendingInitialPrompt) return undefined;
  const prompt = session.pendingInitialPrompt;
  delete session.pendingInitialPrompt;
  return prompt;
}

export function cycleActiveProjectSession(
  project: ProjectRecord | undefined,
  direction: 1 | -1,
): string | undefined {
  if (!project) return undefined;
  const nextSessionId = resolveCycledSessionId(
    project.sessions,
    project.activeSessionId,
    direction,
  );
  if (!nextSessionId) return undefined;
  project.activeSessionId = nextSessionId;
  return nextSessionId;
}

export function gotoProjectSession(
  project: ProjectRecord | undefined,
  index: number,
): string | undefined {
  if (!project) return undefined;
  const nextSessionId = resolveSessionIdAtIndex(project.sessions, index);
  if (!nextSessionId) return undefined;
  project.activeSessionId = nextSessionId;
  return nextSessionId;
}

export function collectProjectSessionIdsForScope(
  project: ProjectRecord | undefined,
  scope: SessionRemovalScope,
  anchorSessionId?: string,
): string[] {
  if (!project) return [];
  return collectSessionIdsForRemoval(project.sessions, scope, anchorSessionId);
}
