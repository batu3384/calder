import { appState } from '../state.js';
import { onChange as onGitStatusChange, getGitStatus, getActiveGitPath, getWorktrees, setActiveWorktree, onWorktreeChange } from '../git-status.js';
import { onChange as onStatusChange } from '../session-activity.js';
import type { GitFileEntry } from '../types.js';
import {
  ensureGitSection,
  esc,
  getCompactSummary,
  getSectionPresentation,
  renderGitBodyState,
  renderWorktreeSelector,
} from './git-panel-presentation-helpers.js';
import type { SectionPresentation } from './git-panel-presentation-helpers.js';
import {
  hideGitContextMenu,
  renderGitFilesList,
} from './git-panel-file-actions-helpers.js';

/*
 * Source contract markers kept in this orchestrator after helper extraction:
 * git-file-badge calder-status-pill
 * button.type = 'button'
 * button.setAttribute('aria-expanded'
 * tab-context-menu calder-floating-list
 * applyTabContextMenuSemantics(menu, 'Git file actions'
 */

const MAX_FILES = 100;

let collapsed = false;
let compactExpanded = false;
let lastCountKey = '';
let lastFilesKey = '';
let refreshQueued = false;
const queueFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (callback: FrameRequestCallback): number => globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number;

function afterAction(): void {
  lastFilesKey = '';
  scheduleRefresh();
}

function isDetailExpanded(presentation: SectionPresentation): boolean {
  if (presentation === 'promoted') return true;
  if (presentation === 'compact' || presentation === 'ultra') return compactExpanded;
  return !collapsed;
}

function applyGitPanelVisibility(): void {
  const container = document.getElementById('git-panel');
  if (!container) return;
  const visible = appState.preferences.sidebarViews?.gitPanel ?? true;
  container.classList.toggle('hidden', !visible);
}

/** Frame-batched refresh — coalesces rapid-fire events into a single render */
function scheduleRefresh(): void {
  if (refreshQueued) return;
  refreshQueued = true;
  queueFrame(() => {
    refreshQueued = false;
    void refresh();
  });
}

async function refresh(): Promise<void> {
  const container = document.getElementById('git-panel');
  if (!container) return;

  applyGitPanelVisibility();

  const project = appState.activeProject;
  if (!project) {
    container.innerHTML = '';
    return;
  }

  const status = getGitStatus(project.id);
  const activeGitPath = getActiveGitPath(project.id);
  const worktrees = getWorktrees(project.id);
  const hasMultipleWorktrees = worktrees && worktrees.length > 1;
  const total = status?.isGitRepo
    ? status.staged + status.modified + status.untracked + status.conflicted
    : 0;
  const presentation = getSectionPresentation(container);
  const detailExpanded = isDetailExpanded(presentation);
  const showCompactSummary = (presentation === 'compact' || presentation === 'ultra') && !detailExpanded;

  // Find active worktree branch for header
  let headerSuffix = '';
  if (hasMultipleWorktrees) {
    const activeWt = worktrees!.find(w => w.path === activeGitPath);
    if (activeWt?.branch) {
      headerSuffix = ` · ${esc(activeWt.branch)}`;
    }
  }

  const body = ensureGitSection({
    container,
    total,
    headerSuffix,
    detailExpanded,
    showCompactSummary,
    onToggle: () => {
      if (presentation === 'promoted') return;
      if (presentation === 'compact' || presentation === 'ultra') compactExpanded = !compactExpanded;
      else collapsed = !collapsed;
      lastFilesKey = '';
      void refresh();
    },
  });

  // Add worktree selector if multiple worktrees
  if (hasMultipleWorktrees) {
    renderWorktreeSelector({
      container,
      project,
      worktrees,
      activeGitPath,
      onSelectWorktree: setActiveWorktree,
    });
  } else {
    const selector = container.querySelector('.git-worktree-selector');
    if (selector) selector.remove();
  }

  if (!status || !status.isGitRepo) {
    renderGitBodyState(body, 'This folder is not a Git repo yet.', 'muted');
    return;
  }

  if (total === 0) {
    renderGitBodyState(body, showCompactSummary ? 'Git is clean' : 'Working tree clean.', 'healthy');
    return;
  }

  if (showCompactSummary) {
    renderGitBodyState(
      body,
      getCompactSummary(total, status.conflicted),
      status.conflicted > 0 ? 'warning' : 'default',
    );
    return;
  }

  if (detailExpanded) {
    loadFiles(body, activeGitPath);
  }
}

async function loadFiles(body: HTMLElement, gitPath: string): Promise<void> {
  // Show loading only on first load (when body is empty)
  if (!body.hasChildNodes()) {
    body.innerHTML = '<div class="config-loading">Loading…</div>';
  }

  let files: GitFileEntry[];
  try {
    files = await window.calder.git.getFiles(gitPath) as GitFileEntry[];
  } catch {
    body.innerHTML = '';
    lastFilesKey = '';
    return;
  }

  // Skip DOM rebuild if file list hasn't changed
  const filesKey = JSON.stringify(files);
  if (filesKey === lastFilesKey) return;
  lastFilesKey = filesKey;

  renderGitFilesList({
    body,
    files,
    gitPath,
    maxFiles: MAX_FILES,
    onAfterAction: afterAction,
  });
}

export function toggleGitPanel(): void {
  const container = document.getElementById('git-panel');
  if (!container || !container.firstElementChild) return;
  const presentation = getSectionPresentation(container);

  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (presentation === 'promoted') return;
  if (presentation === 'compact' || presentation === 'ultra') compactExpanded = !compactExpanded;
  else collapsed = !collapsed;
  lastFilesKey = '';
  void refresh();
}

export function initGitPanel(): void {
  document.addEventListener('click', hideGitContextMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideGitContextMenu(); });

  appState.on('project-changed', () => { lastFilesKey = ''; scheduleRefresh(); });
  appState.on('state-loaded', () => { lastFilesKey = ''; scheduleRefresh(); });

  // Refresh when git status counts change
  onGitStatusChange((projectId, status) => {
    if (projectId !== appState.activeProjectId) return;
    const key = `${status.staged}:${status.modified}:${status.untracked}:${status.conflicted}`;
    if (key !== lastCountKey) {
      lastCountKey = key;
      lastFilesKey = '';
      refresh();
    }
  });

  // Refresh on session working → waiting transition (don't clear lastFilesKey —
  // poll() in git-status.ts handles that when status actually changes)
  onStatusChange((_sessionId, status) => {
    if (status === 'waiting' || status === 'completed') {
      scheduleRefresh();
    }
  });

  // Refresh when worktree list or active worktree changes
  onWorktreeChange(() => { lastFilesKey = ''; scheduleRefresh(); });

  appState.on('session-changed', () => { scheduleRefresh(); });
  appState.on('preferences-changed', () => applyGitPanelVisibility());
}
