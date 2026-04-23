import type { InitialContextSnapshot } from '../shared/types/session.js';
import type { ProjectRecord } from '../shared/types/project-state.js';

export function addInsightSnapshotToProject(project: ProjectRecord, snapshot: InitialContextSnapshot): void {
  if (!project.insights) {
    project.insights = { initialContextSnapshots: [], dismissed: [] };
  }
  project.insights.initialContextSnapshots.push(snapshot);
  if (project.insights.initialContextSnapshots.length > 50) {
    project.insights.initialContextSnapshots = project.insights.initialContextSnapshots.slice(-50);
  }
}

export function dismissInsightForProject(project: ProjectRecord, insightId: string): void {
  if (!project.insights) {
    project.insights = { initialContextSnapshots: [], dismissed: [] };
  }
  if (!project.insights.dismissed.includes(insightId)) {
    project.insights.dismissed.push(insightId);
  }
}

export function isInsightDismissedForProject(project: ProjectRecord, insightId: string): boolean {
  return project.insights?.dismissed.includes(insightId) ?? false;
}

export function reorderProjectSession(project: ProjectRecord, sessionId: string, toIndex: number): boolean {
  const fromIndex = project.sessions.findIndex((session) => session.id === sessionId);
  if (fromIndex === -1 || fromIndex === toIndex) return false;

  const [session] = project.sessions.splice(fromIndex, 1);
  project.sessions.splice(toIndex, 0, session);

  if (project.layout.splitPanes.length > 0) {
    project.layout.splitPanes = project.sessions
      .filter((entry) => project.layout.splitPanes.includes(entry.id))
      .map((entry) => entry.id);
  }

  return true;
}
