import { describe, expect, it } from 'vitest';
import type { GitStatus } from '../../git-status.js';
import { buildGitStatusView } from './tab-bar-git-status-view.js';

const esc = (value: string) => value.replace(/</g, '&lt;').replace(/>/g, '&gt;');

function makeStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    isGitRepo: true,
    branch: 'main',
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
    ...overrides,
  };
}

describe('tab-bar-git-status-view', () => {
  it('returns hidden view when there is no active project', () => {
    expect(buildGitStatusView(false, null, esc)).toEqual({
      html: '',
      state: 'hidden',
      busy: false,
      shouldRefresh: false,
    });
  });

  it('returns loading view when git status is not yet available', () => {
    expect(buildGitStatusView(true, null, esc)).toEqual({
      html: '<span class="git-branch">\u2387 \u2026</span>',
      state: 'loading',
      busy: true,
      shouldRefresh: true,
    });
  });

  it('returns hidden view when the project is not a git repo', () => {
    expect(buildGitStatusView(true, makeStatus({ isGitRepo: false }), esc)).toEqual({
      html: '',
      state: 'hidden',
      busy: false,
      shouldRefresh: false,
    });
  });

  it('renders clean git status markup', () => {
    const view = buildGitStatusView(true, makeStatus({ branch: 'feature/<x>', ahead: 1, behind: 2 }), esc);
    expect(view.state).toBe('clean');
    expect(view.busy).toBe(false);
    expect(view.shouldRefresh).toBe(false);
    expect(view.html).toContain('&lt;x&gt;');
    expect(view.html).toContain('↑1 ↓2');
  });

  it('renders dirty git status markup', () => {
    const view = buildGitStatusView(
      true,
      makeStatus({ staged: 3, modified: 2, untracked: 1, conflicted: 1 }),
      esc,
    );
    expect(view.state).toBe('dirty');
    expect(view.html).toContain('<span class="git-staged">+3</span>');
    expect(view.html).toContain('<span class="git-modified">~2</span>');
    expect(view.html).toContain('<span class="git-untracked">?1</span>');
    expect(view.html).toContain('<span class="git-conflicted">!1</span>');
  });
});
