import { appState } from './state.js';

export function openPreviewTargetInLiveView(projectId: string, url: string) {
  return appState.openUrlInBrowserSurface(projectId, url);
}

export function openWorkspaceShellLogs(projectId: string): boolean {
  const project = appState.projects.find((entry) => entry.id === projectId);
  if (!project) return false;
  if (appState.activeProjectId !== projectId) {
    appState.setActiveProject(projectId);
  }
  appState.setTerminalPanelOpen(true);
  return true;
}
