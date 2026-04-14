import type { ProjectTeamContextState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function applyProjectTeamContext(projectPath: string, projectTeamContext: ProjectTeamContextState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectTeamContext(projectId, projectTeamContext);
}

async function syncActiveProjectTeamContext(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.teamContext.watchProject(project.path);
  }

  const requestToken = ++activeRequestToken;
  const projectTeamContext = await window.calder.teamContext.getProjectState(project.path);
  if (requestToken !== activeRequestToken) return;
  applyProjectTeamContext(project.path, projectTeamContext);
}

export function initProjectTeamContextSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectTeamContext();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectTeamContext();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectTeamContext();
    }),
    window.calder.teamContext.onChanged((projectPath, projectTeamContext) => {
      applyProjectTeamContext(projectPath, projectTeamContext);
    }),
  ];

  void syncActiveProjectTeamContext();
}

export function _resetProjectTeamContextSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
