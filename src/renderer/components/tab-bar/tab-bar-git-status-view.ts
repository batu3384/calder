import type { GitStatus } from '../surface-services/git-status.js';

export type GitStatusViewState = 'hidden' | 'loading' | 'clean' | 'dirty';

export interface GitStatusView {
  html: string;
  state: GitStatusViewState;
  busy: boolean;
  shouldRefresh: boolean;
}

export function buildGitStatusView(
  hasProject: boolean,
  status: GitStatus | null,
  escapeHtml: (value: string) => string,
): GitStatusView {
  if (!hasProject) {
    return { html: '', state: 'hidden', busy: false, shouldRefresh: false };
  }

  if (!status) {
    return {
      html: '<span class="git-branch">\u2387 \u2026</span>',
      state: 'loading',
      busy: true,
      shouldRefresh: true,
    };
  }

  if (!status.isGitRepo) {
    return { html: '', state: 'hidden', busy: false, shouldRefresh: false };
  }

  const parts: string[] = [];
  if (status.branch) {
    parts.push(`<span class="git-branch">\u2387 ${escapeHtml(status.branch)}</span>`);
  }

  const aheadBehind: string[] = [];
  if (status.ahead > 0) aheadBehind.push(`\u2191${status.ahead}`);
  if (status.behind > 0) aheadBehind.push(`\u2193${status.behind}`);
  if (aheadBehind.length) {
    parts.push(`<span class="git-ahead-behind">${aheadBehind.join(' ')}</span>`);
  }

  if (status.staged > 0) parts.push(`<span class="git-staged">+${status.staged}</span>`);
  if (status.modified > 0) parts.push(`<span class="git-modified">~${status.modified}</span>`);
  if (status.untracked > 0) parts.push(`<span class="git-untracked">?${status.untracked}</span>`);
  if (status.conflicted > 0) parts.push(`<span class="git-conflicted">!${status.conflicted}</span>`);

  const dirtyCount = status.staged + status.modified + status.untracked + status.conflicted;
  return {
    html: parts.join(' '),
    state: dirtyCount > 0 ? 'dirty' : 'clean',
    busy: false,
    shouldRefresh: false,
  };
}
