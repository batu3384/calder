import type { ProjectCheckpointState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function applyProjectCheckpoints(projectPath: string, projectCheckpoints: ProjectCheckpointState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectCheckpoints(projectId, projectCheckpoints);
}

async function syncActiveProjectCheckpoints(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.checkpoint.watchProject(project.path);
  }

  const requestToken = ++activeRequestToken;
  const projectCheckpoints = await window.calder.checkpoint.getProjectState(project.path);
  if (requestToken !== activeRequestToken) return;
  applyProjectCheckpoints(project.path, projectCheckpoints);
}

export function initProjectCheckpointSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectCheckpoints();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectCheckpoints();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectCheckpoints();
    }),
    window.calder.checkpoint.onChanged((projectPath, projectCheckpoints) => {
      applyProjectCheckpoints(projectPath, projectCheckpoints);
    }),
  ];

  void syncActiveProjectCheckpoints();
}

export function _resetProjectCheckpointSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
