import { describe, expect, it, vi } from 'vitest';

import type { ProjectContextState } from '../../shared/types/project-context.js';
import type { PersistedState, ProjectRecord } from '../../shared/types/project-state.js';
import { normalizeProjectLayout } from '../state-normalizers.js';
import {
  createAppStateRuntimeBridge,
  setProjectDomainForState,
  updateProjectSurfaceForState,
} from './state-appstate-orchestration-helpers.js';
import { defaultPreferences } from './state-contracts.js';

function makeProject(id = 'project-1'): ProjectRecord {
  return {
    id,
    name: `Project ${id}`,
    path: `/tmp/${id}`,
    sessions: [],
    activeSessionId: null,
    layout: normalizeProjectLayout(),
  };
}

function makeContext(id: string): ProjectContextState {
  return {
    sources: [
      {
        id,
        provider: 'shared',
        scope: 'project',
        kind: 'rules',
        path: `${id}.md`,
        displayName: id,
        summary: id,
        lastUpdated: '2026-04-23T00:00:00Z',
      },
    ],
    sharedRuleCount: 1,
    providerSourceCount: 0,
  };
}

function makeState(projects: ProjectRecord[]): PersistedState {
  return {
    version: 1,
    projects,
    activeProjectId: projects[0]?.id ?? null,
    preferences: {
      ...defaultPreferences,
      defaultProvider: 'codex',
      sessionHistoryEnabled: false,
    },
  };
}

describe('state appstate orchestration helpers', () => {
  it('builds a runtime bridge from persisted state preferences and callbacks', () => {
    const project = makeProject();
    const state = makeState([project]);
    const pushNav = vi.fn();
    const pruneNav = vi.fn();
    const persist = vi.fn();
    const emit = vi.fn();
    const buildResumePrompt = vi.fn();

    const bridge = createAppStateRuntimeBridge({
      state,
      pushNav,
      pruneNav,
      persist,
      emit,
      buildResumePrompt,
    });

    expect(bridge.projects).toBe(state.projects);
    expect(bridge.defaultProviderId).toBe('codex');
    expect(bridge.sessionHistoryEnabled).toBe(false);
    bridge.pushNav('session-1');
    bridge.pruneNav('session-2');
    bridge.persist();
    bridge.emit('session-changed');
    expect(pushNav).toHaveBeenCalledWith('session-1');
    expect(pruneNav).toHaveBeenCalledWith('session-2');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('session-changed');
  });

  it('setProjectDomainForState persists and emits only when active project changes', () => {
    const activeProject = makeProject('active');
    const inactiveProject = makeProject('inactive');
    const projects = [activeProject, inactiveProject];
    const persist = vi.fn();
    const emit = vi.fn();

    setProjectDomainForState({
      projects,
      activeProjectId: activeProject.id,
      projectId: activeProject.id,
      key: 'projectContext',
      incoming: makeContext('rules'),
      normalize: (incomingContext) => ({
        ...incomingContext,
        sharedRuleCount: incomingContext.sharedRuleCount + 2,
      }),
      persist,
      emit,
    });

    expect(activeProject.projectContext?.sharedRuleCount).toBe(3);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('project-changed');

    persist.mockClear();
    emit.mockClear();
    inactiveProject.projectContext = makeContext('rules');

    setProjectDomainForState({
      projects,
      activeProjectId: activeProject.id,
      projectId: inactiveProject.id,
      key: 'projectContext',
      incoming: makeContext('rules'),
      normalize: (incomingContext) => incomingContext,
      persist,
      emit,
    });

    expect(persist).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('updateProjectSurfaceForState emits project/session events only when mutate returns true', () => {
    const project = makeProject();
    const persist = vi.fn();
    const emit = vi.fn();

    updateProjectSurfaceForState({
      projects: [project],
      projectId: project.id,
      mutate: () => false,
      persist,
      emit,
    });

    expect(persist).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    updateProjectSurfaceForState({
      projects: [project],
      projectId: project.id,
      mutate: () => true,
      persist,
      emit,
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenNthCalledWith(1, 'project-changed');
    expect(emit).toHaveBeenNthCalledWith(2, 'session-changed');
  });
});
