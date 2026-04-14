import type { ProjectReviewState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function applyProjectReviews(projectPath: string, projectReviews: ProjectReviewState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectReviews(projectId, projectReviews);
}

async function syncActiveProjectReviews(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.review.watchProject(project.path);
  }

  const requestToken = ++activeRequestToken;
  const projectReviews = await window.calder.review.getProjectState(project.path);
  if (requestToken !== activeRequestToken) return;
  applyProjectReviews(project.path, projectReviews);
}

export function initProjectReviewSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectReviews();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectReviews();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectReviews();
    }),
    window.calder.review.onChanged((projectPath, projectReviews) => {
      applyProjectReviews(projectPath, projectReviews);
    }),
  ];

  void syncActiveProjectReviews();
}

export function _resetProjectReviewSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
