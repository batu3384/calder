import type { ProjectSurfaceRecord } from '../../../shared/types/project-surface.js';
import { appState, type ProjectRecord } from '../../state.js';

export function createDefaultProjectSurface(): ProjectSurfaceRecord {
  return {
    kind: 'web',
    active: false,
    web: { history: [] },
  };
}

export function getProjectSurface(project: ProjectRecord): ProjectSurfaceRecord {
  return project.surface ?? createDefaultProjectSurface();
}

export function updateProjectSurface(project: ProjectRecord, next: ProjectSurfaceRecord): void {
  appState.setProjectSurface(project.id, next);
}
