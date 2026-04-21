import { describe, expect, it } from 'vitest';
import type { CliSurfaceProfile, ProjectRecord } from '../../shared/types.js';
import {
  createDefaultProjectSurface,
  getProjectSurface,
  upsertCliSurfaceProfile,
} from './tab-bar-surface-state.js';

function makeProject(surface?: ProjectRecord['surface']): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    ...(surface ? { surface } : {}),
    layout: {
      mode: 'tabs',
      splitPanes: [],
      splitDirection: 'horizontal',
    },
  };
}

function makeProfile(id: string, name = id): CliSurfaceProfile {
  return {
    id,
    name,
    command: 'npm',
    args: ['run', 'dev'],
    cwd: '/tmp/project',
    portMode: 'auto',
  };
}

describe('tab-bar-surface-state', () => {
  it('provides a stable default project surface shape', () => {
    expect(createDefaultProjectSurface()).toEqual({
      kind: 'web',
      active: false,
      tabFocus: 'session',
      tabPlacement: 'end',
      tabOrder: ['cli', 'mobile'],
      web: { history: [] },
      cli: { profiles: [], runtime: { status: 'idle' } },
    });
  });

  it('falls back to defaults when project surface is missing', () => {
    const project = makeProject();
    expect(getProjectSurface(project)).toEqual(createDefaultProjectSurface());
  });

  it('upserts CLI surface profiles by id', () => {
    const surface = createDefaultProjectSurface();
    const existing = makeProfile('profile-1', 'Existing');
    surface.cli = {
      profiles: [existing],
      selectedProfileId: existing.id,
      runtime: { status: 'idle' },
    };

    const project = makeProject(surface);
    const renamed = makeProfile('profile-1', 'Renamed');
    const added = makeProfile('profile-2', 'Added');

    expect(upsertCliSurfaceProfile(project, renamed)).toEqual([renamed]);
    expect(upsertCliSurfaceProfile(project, added)).toEqual([existing, added]);
  });
});
