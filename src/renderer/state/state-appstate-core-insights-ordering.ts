import type { ProjectRecord } from '../../shared/types/project-state.js';
import type { InitialContextSnapshot } from '../../shared/types/session.js';
import {
  addInsightSnapshotToProject,
  dismissInsightForProject,
  isInsightDismissedForProject,
  reorderProjectSession,
} from '../state-session-mutators.js';
import { findProjectById } from './state-appstate-core-project-access.js';

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
