import { appState, type ProjectRecord } from '../state.js';
import type { CliSurfaceProfile, ProjectSurfaceRecord } from '../../shared/types/project.js';

export function createDefaultProjectSurface(): ProjectSurfaceRecord {
  return {
    kind: 'web',
    active: false,
    tabFocus: 'session',
    tabPlacement: 'end',
    tabOrder: ['cli', 'mobile'],
    web: { history: [] },
    cli: { profiles: [], runtime: { status: 'idle' } },
  };
}

export function getProjectSurface(project: ProjectRecord): ProjectSurfaceRecord {
  return project.surface ?? createDefaultProjectSurface();
}

export function updateProjectSurface(project: ProjectRecord, next: ProjectSurfaceRecord): void {
  appState.setProjectSurface(project.id, next);
}

export function upsertCliSurfaceProfile(project: ProjectRecord, profile: CliSurfaceProfile): CliSurfaceProfile[] {
  const surface = getProjectSurface(project);
  const profiles = [...(surface.cli?.profiles ?? [])];
  const existingIndex = profiles.findIndex((entry) => entry.id === profile.id);
  if (existingIndex >= 0) {
    profiles[existingIndex] = profile;
  } else {
    profiles.push(profile);
  }
  return profiles;
}

function buildCliRuntimeWithSelectedProfile(
  surface: ProjectSurfaceRecord,
  selectedProfileId: string,
): NonNullable<ProjectSurfaceRecord['cli']>['runtime'] {
  if (surface.cli?.runtime) {
    return {
      ...surface.cli.runtime,
      selectedProfileId,
    };
  }
  return {
    status: 'idle',
    selectedProfileId,
  };
}

export function selectCliSurfaceProfile(
  project: ProjectRecord,
  profiles: CliSurfaceProfile[],
  selectedProfileId: string,
): void {
  const surface = getProjectSurface(project);
  updateProjectSurface(project, {
    ...surface,
    kind: 'cli',
    active: true,
    cli: {
      profiles,
      selectedProfileId,
      runtime: buildCliRuntimeWithSelectedProfile(surface, selectedProfileId),
    },
  });
}

export function persistAndLaunchCliSurfaceProfile(project: ProjectRecord, profile: CliSurfaceProfile): void {
  const profiles = upsertCliSurfaceProfile(project, profile);
  selectCliSurfaceProfile(project, profiles, profile.id);
  void window.calder?.cliSurface?.start(project.id, profile);
}
