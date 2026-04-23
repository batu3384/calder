import type { PersistedState } from '../shared/types/project-state.js';
import { stripTransientRuntimeFields } from './state-normalizers.js';

export function buildRendererPersistSnapshot(state: PersistedState): PersistedState {
  return {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      surface: project.surface
        ? {
            ...project.surface,
            web: project.surface.web
              ? {
                  ...project.surface.web,
                  history: project.surface.web.history ? [...project.surface.web.history] : [],
                }
              : project.surface.web,
            cli: project.surface.cli
              ? {
                  ...project.surface.cli,
                  profiles: [...project.surface.cli.profiles],
                  runtime: project.surface.cli.runtime
                    ? stripTransientRuntimeFields(project.surface.cli.runtime)
                    : undefined,
                }
              : project.surface.cli,
          }
        : undefined,
      sessions: project.sessions.map(({ pendingInitialPrompt: _pendingInitialPrompt, ...rest }) => rest),
    })),
  };
}
