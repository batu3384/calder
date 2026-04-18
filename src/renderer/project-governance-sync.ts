import type { ProjectGovernanceState } from '../shared/types.js';
import { appState } from './state.js';

let initialized = false;
let watchedProjectPath: string | null = null;
let activeRequestToken = 0;
let cleanupFns: Array<() => void> = [];

function findProjectIdByPath(projectPath: string): string | undefined {
  return appState.projects.find((project) => project.path === projectPath)?.id;
}

function getActiveCliSessionId(): string | undefined {
  return appState.activeSession && !appState.activeSession.type
    ? appState.activeSession.id
    : undefined;
}

function applyProjectGovernance(projectPath: string, projectGovernance: ProjectGovernanceState): void {
  const projectId = findProjectIdByPath(projectPath);
  if (!projectId) return;
  appState.setProjectGovernance(projectId, projectGovernance);
}

async function syncActiveProjectGovernance(): Promise<void> {
  const project = appState.activeProject;
  if (!project) {
    watchedProjectPath = null;
    return;
  }

  if (project.path !== watchedProjectPath) {
    watchedProjectPath = project.path;
    window.calder.governance.watchProject(project.path);
  }

  const activeCliSessionId = getActiveCliSessionId();
  const requestToken = ++activeRequestToken;
  const projectGovernance = await window.calder.governance.getProjectState(project.path, activeCliSessionId);
  if (requestToken !== activeRequestToken) return;
  applyProjectGovernance(project.path, projectGovernance);
}

async function handleGovernanceChanged(
  projectPath: string,
  projectGovernance: ProjectGovernanceState,
): Promise<void> {
  const activeProject = appState.activeProject;
  const activeCliSessionId = getActiveCliSessionId();
  if (activeProject?.path !== projectPath || !activeCliSessionId) {
    applyProjectGovernance(projectPath, projectGovernance);
    return;
  }

  const requestToken = ++activeRequestToken;
  const resolved = await window.calder.governance.getProjectState(projectPath, activeCliSessionId);
  if (requestToken !== activeRequestToken) return;
  applyProjectGovernance(projectPath, resolved);
}

export function initProjectGovernanceSync(): void {
  if (initialized) return;
  initialized = true;

  cleanupFns = [
    appState.on('state-loaded', () => {
      void syncActiveProjectGovernance();
    }),
    appState.on('project-added', () => {
      void syncActiveProjectGovernance();
    }),
    appState.on('project-changed', () => {
      void syncActiveProjectGovernance();
    }),
    appState.on('session-changed', () => {
      void syncActiveProjectGovernance();
    }),
    window.calder.governance.onChanged((projectPath, projectGovernance) => {
      void handleGovernanceChanged(projectPath, projectGovernance);
    }),
  ];

  void syncActiveProjectGovernance();
}

export function _resetProjectGovernanceSyncForTesting(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  initialized = false;
  watchedProjectPath = null;
  activeRequestToken = 0;
}
