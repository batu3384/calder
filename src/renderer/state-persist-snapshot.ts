import type { PersistedState } from '../shared/types/project-state.js';

export function buildRendererPersistSnapshot(state: PersistedState): PersistedState {
  return {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      surface: project.surface
        ? {
            kind: 'web' as const,
            active: project.surface.active,
            targetSessionId: project.surface.targetSessionId,
            web: project.surface.web
              ? {
                  ...project.surface.web,
                  history: project.surface.web.history ? [...project.surface.web.history] : [],
                }
              : project.surface.web,
          }
        : undefined,
      sessions: project.sessions.map(
        ({ pendingInitialPrompt: _pendingInitialPrompt, ...rest }) => rest,
      ),
    })),
  };
}
