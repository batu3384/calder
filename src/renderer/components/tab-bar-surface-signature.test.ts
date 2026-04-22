import { describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../../shared/types/project.js';
import { buildSurfaceControlsSignatureForProject } from './tab-bar-surface-signature.js';

function makeProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    surface: {
      kind: 'cli',
      active: true,
      tabFocus: 'cli',
      tabPlacement: 'end',
      tabOrder: ['cli', 'mobile'],
      web: { history: [] },
      cli: {
        selectedProfileId: 'profile-1',
        profiles: [
          {
            id: 'profile-1',
            name: 'Textual',
            command: 'python',
            args: ['-m', 'textual', 'run', 'app.py'],
            cwd: '/tmp/project',
            portMode: 'auto',
          },
        ],
        runtime: { status: 'idle' },
      },
    },
    layout: {
      mode: 'tabs',
      splitPanes: [],
      splitDirection: 'horizontal',
    },
  };
}

describe('tab-bar-surface-signature', () => {
  it('builds a stable signature from surface and profiles', () => {
    const project = makeProject();
    const signature = buildSurfaceControlsSignatureForProject(project);
    expect(signature).toContain('project-1::cli::1::cli::profile-1::');
    expect(signature).toContain('profile-1:Textual:');
    expect(signature).toContain('/tmp/project:python');
  });

  it('includes default surface when project surface is missing', () => {
    const project = makeProject();
    delete project.surface;
    expect(buildSurfaceControlsSignatureForProject(project)).toContain('project-1::web::0::session');
  });
});
