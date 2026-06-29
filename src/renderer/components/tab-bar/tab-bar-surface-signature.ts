import type { ProjectRecord } from '../../../shared/types/project-state.js';
import { getCliSurfaceProfileLabel } from '../cli-surface/profile.js';
import { getProjectSurface } from './tab-bar-surface-state.js';

export function buildSurfaceControlsSignatureForProject(project: ProjectRecord): string {
  const surface = getProjectSurface(project);
  const profiles = surface.cli?.profiles ?? [];
  const profileSignature = profiles
    .map(
      (profile) =>
        `${profile.id}:${getCliSurfaceProfileLabel(profile)}:${profile.cwd ?? ''}:${profile.command}`,
    )
    .join('|');
  return [
    project.id,
    surface.kind,
    surface.active ? '1' : '0',
    surface.tabFocus ?? 'session',
    surface.cli?.selectedProfileId ?? '',
    profileSignature,
  ].join('::');
}
