import type { ProjectContextState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function applyProjectContext(projectPath: string, projectContext: ProjectContextState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectContext(projectId, projectContext);
}

async function syncActiveProjectContext(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.context.watchProject(project.path);
  }

  const requestToken = ++activeRequestToken;
  const projectContext = await window.calder.context.getProjectState(project.path);
  if (requestToken !== activeRequestToken) return;
  applyProjectContext(project.path, projectContext);
}

export function initProjectContextSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectContext();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectContext();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectContext();
    }),
    window.calder.context.onChanged((projectPath, projectContext) => {
      applyProjectContext(projectPath, projectContext);
    }),
  ];

  void syncActiveProjectContext();
}

export function _resetProjectContextSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
