import type { ProjectRecord } from '../../shared/types/project-state.js';
import type { SessionRecord } from '../../shared/types/session.js';

export function findProjectById(projects: ProjectRecord[], projectId: string): ProjectRecord | undefined {
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
