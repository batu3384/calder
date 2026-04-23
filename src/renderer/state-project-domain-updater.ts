import type { ProjectRecord } from '../shared/types/project-state.js';

export type ProjectDomainStateKey =
  | 'projectContext'
  | 'projectWorkflows'
  | 'projectTeamContext'
  | 'projectReviews'
  | 'projectGovernance'
  | 'projectBackgroundTasks'
  | 'projectCheckpoints';

export function setProjectDomainState<K extends ProjectDomainStateKey>(
  project: ProjectRecord,
  key: K,
  incoming: ProjectRecord[K],
  normalize: (
    incoming: NonNullable<ProjectRecord[K]>,
    previous: ProjectRecord[K],
  ) => ProjectRecord[K],
): boolean {
  const nextState = incoming === undefined
    ? undefined
    : normalize(incoming as NonNullable<ProjectRecord[K]>, project[key]);

  const before = JSON.stringify(project[key] ?? null);
  const after = JSON.stringify(nextState ?? null);
  if (before === after) return false;

  project[key] = nextState as ProjectRecord[K];
  return true;
}
