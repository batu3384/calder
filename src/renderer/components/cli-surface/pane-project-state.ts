import type { ProjectRecord } from '../../../shared/types/project-state.js';
import type {
  CliSurfaceProfile,
  CliSurfaceRuntimeState,
  ProjectSurfaceRecord,
} from '../../../shared/types/project-surface.js';

interface CliSurfaceProjectStateStore {
  projects: ProjectRecord[];
  activeProject: ProjectRecord | null | undefined;
  setProjectSurface(projectId: string, surface: ProjectSurfaceRecord): void;
}

export function getCliSurfaceProject(
  state: CliSurfaceProjectStateStore,
  projectId: string,
): ProjectRecord | undefined {
  return state.projects.find((project) => project.id === projectId);
}

export function getCliSurfaceRuntimeState(
  state: CliSurfaceProjectStateStore,
  projectId: string,
): CliSurfaceRuntimeState | undefined {
  return getCliSurfaceProject(state, projectId)?.surface?.cli?.runtime;
}

export function resolveCliSurfaceSelectedProfile(
  state: CliSurfaceProjectStateStore,
  projectId: string,
): CliSurfaceProfile | undefined {
  const cliState = getCliSurfaceProject(state, projectId)?.surface?.cli;
  if (!cliState) return undefined;
  const selectedId = cliState.selectedProfileId ?? cliState.runtime?.selectedProfileId;
  return cliState.profiles.find((profile) => profile.id === selectedId) ?? cliState.profiles[0];
}

export function updateCliSurfaceRuntimeState(
  state: CliSurfaceProjectStateStore,
  projectId: string,
  runtime: CliSurfaceRuntimeState,
): void {
  const project = getCliSurfaceProject(state, projectId);
  if (!project?.surface) return;

  state.setProjectSurface(projectId, {
    ...project.surface,
    cli: {
      selectedProfileId: runtime.selectedProfileId ?? project.surface.cli?.selectedProfileId,
      profiles: project.surface.cli?.profiles ?? [],
      runtime,
    },
  });
}
