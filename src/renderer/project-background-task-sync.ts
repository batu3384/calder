import type { ProjectBackgroundTaskState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function applyProjectBackgroundTasks(projectPath: string, projectBackgroundTasks: ProjectBackgroundTaskState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectBackgroundTasks(projectId, projectBackgroundTasks);
}

async function syncActiveProjectBackgroundTasks(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.task.watchProject(project.path);
  }

  const requestToken = ++activeRequestToken;
  const projectBackgroundTasks = await window.calder.task.getProjectState(project.path);
  if (requestToken !== activeRequestToken) return;
  applyProjectBackgroundTasks(project.path, projectBackgroundTasks);
}

export function initProjectBackgroundTaskSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectBackgroundTasks();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectBackgroundTasks();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectBackgroundTasks();
    }),
    window.calder.task.onChanged((projectPath, projectBackgroundTasks) => {
      applyProjectBackgroundTasks(projectPath, projectBackgroundTasks);
    }),
  ];

  void syncActiveProjectBackgroundTasks();
}

export function _resetProjectBackgroundTaskSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
