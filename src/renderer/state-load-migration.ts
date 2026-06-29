import type { PersistedState, Preferences, ProjectRecord } from '../shared/types/project-state.js';
import type { ProviderId } from '../shared/types/provider.js';
import { restoreContext } from './session-context.js';
import { restoreCost } from './session-cost.js';
import { normalizeProjectLayout, normalizeProjectSurface } from './state-normalizers.js';
import { repairProjectSurface } from './state-project-surface.js';

export interface RendererStateMigrationResult {
  state: PersistedState;
  didMigrateState: boolean;
}

export function migrateLoadedRendererState(
  loadedState: PersistedState,
  defaultPreferences: Preferences,
): RendererStateMigrationResult {
  const state = loadedState;
  let didMigrateState = false;

  // Merge defaults for forward compatibility with old state files
  const normalizedPreferences = { ...defaultPreferences, ...state.preferences };
  if (JSON.stringify(state.preferences) !== JSON.stringify(normalizedPreferences)) {
    didMigrateState = true;
  }
  state.preferences = normalizedPreferences;
  delete (state.preferences as Preferences & { readinessExcludedProviders?: ProviderId[] })
    .readinessExcludedProviders;
  if (state.preferences.sidebarViews) {
    delete (
      state.preferences.sidebarViews as Preferences['sidebarViews'] & { readinessSection?: boolean }
    ).readinessSection;
  }

  const normalizedProjects = state.projects.map((project) => {
    const nextProject = {
      ...(project as ProjectRecord & { readiness?: unknown }),
      layout: normalizeProjectLayout(project.layout),
      surface: normalizeProjectSurface(project),
    };
    delete (nextProject as ProjectRecord & { readiness?: unknown }).readiness;
    return nextProject;
  });
  if (JSON.stringify(state.projects) !== JSON.stringify(normalizedProjects)) {
    didMigrateState = true;
  }
  state.projects = normalizedProjects;

  // Restore persisted cost/context data into in-memory stores.
  for (const project of state.projects) {
    if (repairProjectSurface(project)) {
      didMigrateState = true;
    }
    for (const session of project.sessions) {
      if (session.cost) {
        restoreCost(session.id, session.cost);
      }
      if (session.contextWindow) {
        restoreContext(session.id, session.contextWindow);
      }
    }
    // Migrate duplicate archived session IDs (caused by /clear creating two entries with same id)
    if (project.sessionHistory) {
      const seenIds = new Set<string>();
      for (const entry of project.sessionHistory) {
        if (seenIds.has(entry.id)) {
          entry.id = crypto.randomUUID();
          didMigrateState = true;
        }
        seenIds.add(entry.id);
      }
    }
  }

  return { state, didMigrateState };
}
