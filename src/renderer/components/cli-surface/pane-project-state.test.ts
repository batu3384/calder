import { describe, expect, it, vi } from 'vitest';
import {
  getCliSurfaceProject,
  getCliSurfaceRuntimeState,
  resolveCliSurfaceSelectedProfile,
  updateCliSurfaceRuntimeState,
} from './pane-project-state.js';

function createState() {
  return {
    projects: [
      {
        id: 'project-1',
        name: 'Project One',
        path: '/tmp/project-1',
        sessions: [],
        activeSessionId: null,
        layout: {
          mode: 'single',
        },
        surface: {
          kind: 'cli',
          active: true,
          cli: {
            selectedProfileId: 'profile-2',
            profiles: [
              { id: 'profile-1', name: 'Codex Main', command: 'codex' },
              { id: 'profile-2', name: 'Qwen', command: 'qwen' },
            ],
            runtime: {
              status: 'running',
              command: 'qwen',
              selectedProfileId: 'profile-2',
            },
          },
        },
      },
    ],
    activeProject: null,
    setProjectSurface: vi.fn(),
  } as any;
}

describe('cli surface pane project state helpers', () => {
  it('resolves project and runtime state from the shared app-state container', () => {
    const state = createState();
    expect(getCliSurfaceProject(state, 'project-1')?.id).toBe('project-1');
    expect(getCliSurfaceRuntimeState(state, 'project-1')?.status).toBe('running');
    expect(getCliSurfaceProject(state, 'missing')).toBeUndefined();
    expect(getCliSurfaceRuntimeState(state, 'missing')).toBeUndefined();
  });

  it('resolves selected profile by explicit selection and runtime fallback', () => {
    const state = createState();
    expect(resolveCliSurfaceSelectedProfile(state, 'project-1')?.id).toBe('profile-2');

    state.projects[0].surface.cli.selectedProfileId = undefined;
    state.projects[0].surface.cli.runtime.selectedProfileId = 'profile-1';
    expect(resolveCliSurfaceSelectedProfile(state, 'project-1')?.id).toBe('profile-1');
  });

  it('merges runtime updates through setProjectSurface without dropping profiles', () => {
    const state = createState();

    updateCliSurfaceRuntimeState(state, 'project-1', {
      status: 'stopped',
      lastExitCode: 0,
      selectedProfileId: 'profile-2',
    });

    expect(state.setProjectSurface).toHaveBeenCalledTimes(1);
    expect(state.setProjectSurface).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        cli: expect.objectContaining({
          selectedProfileId: 'profile-2',
          profiles: expect.arrayContaining([
            expect.objectContaining({ id: 'profile-1' }),
            expect.objectContaining({ id: 'profile-2' }),
          ]),
          runtime: expect.objectContaining({
            status: 'stopped',
            lastExitCode: 0,
          }),
        }),
      }),
    );
  });
});
