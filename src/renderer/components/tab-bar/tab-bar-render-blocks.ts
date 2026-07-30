import type { ProjectRecord } from '../../state.js';
import type { GitStatus } from '../surface-services/git-status.js';
import { buildGitStatusView } from './tab-bar-git-status-view.js';

export function shouldSkipTabListRender(tabListEl: HTMLElement): boolean {
  return Boolean(tabListEl.querySelector('.tab-name input'));
}

export function buildActiveTabRailKey(
  activeProjectId: string | null,
  project: ProjectRecord,
): string {
  return [
    activeProjectId,
    project.activeSessionId,
    project.sessions.length,
    project.surface?.kind ?? 'none',
    project.surface?.active ? 'surface-open' : 'surface-closed',
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
  const { gitStatusEl, project, gitStatus, escapeHtml, refreshGitStatus } = options;
  const view = buildGitStatusView(Boolean(project), gitStatus, escapeHtml);
  gitStatusEl.innerHTML = view.html;
  gitStatusEl.dataset.state = view.state;
  if (view.title) {
    gitStatusEl.setAttribute('title', view.title);
    gitStatusEl.setAttribute('aria-label', view.title);
  } else {
    gitStatusEl.setAttribute('aria-label', 'Git branch and working tree status');
    gitStatusEl.removeAttribute('title');
  }
  if (view.busy) {
    gitStatusEl.setAttribute('aria-busy', 'true');
  } else {
    gitStatusEl.removeAttribute('aria-busy');
  }
  if (view.shouldRefresh) {
    void refreshGitStatus();
  }
}
