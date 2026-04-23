import type { ProjectRecord } from '../../state.js';
import type { GitStatus } from '../surface-services/git-status.js';
import { getProjectSurface } from './tab-bar-surface-state.js';
import { buildGitStatusView } from './tab-bar-git-status-view.js';

export interface TabBarRenderSurfaceState {
  cliSurfaceTabActive: boolean;
  mobileSurfaceTabActive: boolean;
}

export function shouldSkipTabListRender(tabListEl: HTMLElement): boolean {
  return Boolean(tabListEl.querySelector('.tab-name input'));
}

export function buildTabBarRenderSurfaceState(project: ProjectRecord): TabBarRenderSurfaceState {
  const surfaceState = getProjectSurface(project);
  return {
    cliSurfaceTabActive: surfaceState.active && surfaceState.kind === 'cli' && surfaceState.tabFocus === 'cli',
    mobileSurfaceTabActive: surfaceState.active && surfaceState.kind === 'mobile' && surfaceState.tabFocus === 'mobile',
  };
}

export function buildActiveTabRailKey(activeProjectId: string | null, project: ProjectRecord): string {
  return [
    activeProjectId,
    project.activeSessionId,
    project.sessions.length,
    project.surface?.kind ?? 'none',
    project.surface?.active ? 'surface-open' : 'surface-closed',
    project.surface?.tabFocus ?? 'session',
  ].join(':');
}

interface RenderGitStatusBlockOptions {
  gitStatusEl: HTMLElement;
  project: ProjectRecord | null;
  gitStatus: GitStatus | null;
  escapeHtml: (value: string) => string;
  refreshGitStatus: () => Promise<void>;
}

export function renderGitStatusBlock(options: RenderGitStatusBlockOptions): void {
  const {
    gitStatusEl,
    project,
    gitStatus,
    escapeHtml,
    refreshGitStatus,
  } = options;
  const view = buildGitStatusView(
    Boolean(project),
    gitStatus,
    escapeHtml,
  );
  gitStatusEl.innerHTML = view.html;
  gitStatusEl.dataset.state = view.state;
  if (view.busy) {
    gitStatusEl.setAttribute('aria-busy', 'true');
  } else {
    gitStatusEl.removeAttribute('aria-busy');
  }
  if (view.shouldRefresh) {
    void refreshGitStatus();
  }
}
