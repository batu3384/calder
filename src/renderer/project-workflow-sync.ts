import type { ProjectWorkflowState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function applyProjectWorkflows(projectPath: string, projectWorkflows: ProjectWorkflowState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectWorkflows(projectId, projectWorkflows);
}

async function syncActiveProjectWorkflows(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.workflow.watchProject(project.path);
  }

  const requestToken = ++activeRequestToken;
  const projectWorkflows = await window.calder.workflow.getProjectState(project.path);
  if (requestToken !== activeRequestToken) return;
  applyProjectWorkflows(project.path, projectWorkflows);
}

export function initProjectWorkflowSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectWorkflows();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectWorkflows();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectWorkflows();
    }),
    window.calder.workflow.onChanged((projectPath, projectWorkflows) => {
      applyProjectWorkflows(projectPath, projectWorkflows);
    }),
  ];

  void syncActiveProjectWorkflows();
}

export function _resetProjectWorkflowSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
