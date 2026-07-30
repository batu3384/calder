import { describe, expect, it } from 'vitest';

import type { ProjectRecord } from '../../../shared/types/project-state.js';
import { buildSurfaceControlsSignatureForProject } from './tab-bar-surface-signature.js';

function makeProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    surface: {
      kind: 'web',
      active: true,
      targetSessionId: 'session-1',
      web: {
        sessionId: 'browser-1',
        url: 'http://localhost:3000',
        history: ['http://localhost:3000'],
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
  it('builds a stable signature from web surface state', () => {
    const project = makeProject();
    const signature = buildSurfaceControlsSignatureForProject(project);
    expect(signature).toBe('project-1::web::1');
  });

  it('includes default surface when project surface is missing', () => {
    const project = makeProject();
    delete project.surface;
    expect(buildSurfaceControlsSignatureForProject(project)).toBe('project-1::web::0');
  });
});
