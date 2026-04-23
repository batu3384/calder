import type { ProjectRecord } from '../../shared/types/project-state.js';
import type { SessionRecord } from '../../shared/types/session.js';
import type { AppStateRuntimeBridge } from './state-appstate-runtime-bridge-types.js';

export function emitSessionAdded(
  bridge: AppStateRuntimeBridge,
  projectId: string,
): (session: SessionRecord) => void {
  return (session: SessionRecord) => bridge.emit('session-added', { projectId, session });
}

export function findProjectById(projects: ProjectRecord[], projectId: string): ProjectRecord | undefined {
  return projects.find((project) => project.id === projectId);
}

export function addOrUpdateSessionWithBridge(
  bridge: AppStateRuntimeBridge,
  projectId: string,
  run: (project: ProjectRecord) => { session: SessionRecord; created: boolean },
): SessionRecord | undefined {
  const project = findProjectById(bridge.projects, projectId);
  if (!project) return undefined;
  const result = run(project);
  bridge.persist();
  if (result.created) bridge.emit('session-added', { projectId, session: result.session });
  bridge.emit('session-changed');
  return result.session;
}
