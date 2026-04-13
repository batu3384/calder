import { appState } from '../state.js';
import { onChange as onGitStatusChange, getGitStatus, getActiveGitPath, getWorktrees, setActiveWorktree, onWorktreeChange } from '../git-status.js';
import { onChange as onStatusChange } from '../session-activity.js';
import { showFileViewer } from './file-viewer.js';
import { areaLabel } from '../dom-utils.js';
import type { GitFileEntry } from '../types.js';

const MAX_FILES = 100;
type SectionPresentation = 'compact' | 'expanded' | 'promoted';

let collapsed = false;
let compactExpanded = false;
let lastCountKey = '';
let lastFilesKey = '';
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let activeContextMenu: HTMLElement | null = null;

function hideGitContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

function createMenuItem(label: string, onClick: () => void, disabled = false): HTMLElement {
  const item = document.createElement('div');
  item.className = 'tab-context-menu-item' + (disabled ? ' disabled' : '');
  item.textContent = label;
  if (!disabled) {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      hideGitContextMenu();
      onClick();
    });
  }
  return item;
}

function createSeparator(): HTMLElement {
  const sep = document.createElement('div');
  sep.className = 'tab-context-menu-separator';
  return sep;
}

function afterAction(): void {
  lastFilesKey = '';
  scheduleRefresh();
}

function showGitFileContextMenu(x: number, y: number, entry: GitFileEntry, gitPath: string): void {
  hideGitContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  if (entry.area === 'staged') {
    menu.appendChild(createMenuItem('Unstage', async () => {
      await window.calder.git.unstageFile(gitPath, entry.path);
      afterAction();
    }));
  } else {
    menu.appendChild(createMenuItem('Stage', async () => {
      await window.calder.git.stageFile(gitPath, entry.path);
      afterAction();
    }));
  }

  if (entry.area !== 'staged' && entry.area !== 'conflicted') {
    menu.appendChild(createMenuItem('Discard Changes', async () => {
      const msg = entry.area === 'untracked'
        ? `Delete untracked file "${entry.path}"?`
        : `Discard changes to "${entry.path}"? This cannot be undone.`;
      if (confirm(msg)) {
        await window.calder.git.discardFile(gitPath, entry.path, entry.area);
        afterAction();
      }
    }));
  }

  menu.appendChild(createSeparator());

  menu.appendChild(createMenuItem('Open in Editor', async () => {
    await window.calder.git.openInEditor(gitPath, entry.path);
  }));

  menu.appendChild(createMenuItem('Copy Path', () => {
    navigator.clipboard.writeText(entry.path);
  }));

  document.body.appendChild(menu);
  activeContextMenu = menu;

  // Adjust if menu goes off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
}


function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function statusBadge(entry: GitFileEntry): string {
  const letterMap: Record<string, string> = {
    added: 'A', modified: 'M', deleted: 'D', renamed: 'R', untracked: '?', conflicted: 'U',
  };
  const letter = letterMap[entry.status] || '?';
  return `<span class="git-file-badge calder-status-pill ${entry.status}">${letter}</span>`;
}

function createActionButton(title: string, icon: string, onClick: (e: Event) => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'git-action-btn';
  btn.title = title;
  btn.ariaLabel = title;
  btn.textContent = icon;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}


function shortPath(fullPath: string): string {
  const parts = fullPath.split('/');
  return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : fullPath;
}

function getSectionPresentation(container: HTMLElement): SectionPresentation {
  const wrapper = container.parentNode as { dataset?: Record<string, string> } | null;
  const value = wrapper?.dataset?.presentation;
  return value === 'compact' || value === 'promoted' || value === 'expanded' ? value : 'expanded';
}

function isDetailExpanded(presentation: SectionPresentation): boolean {
  if (presentation === 'promoted') return true;
  if (presentation === 'compact') return compactExpanded;
  return !collapsed;
}

function getCompactSummary(total: number, conflicted: number): string {
  if (total === 0) return 'Git is clean';
  if (conflicted > 0) {
    return conflicted === 1 ? '1 conflicted file needs review' : `${conflicted} conflicted files need review`;
  }
  return total === 1 ? '1 file changed' : `${total} files changed`;
}

function updateGitHeader(header: HTMLElement, total: number, headerSuffix: string, container: HTMLElement): void {
  header.innerHTML = '';
  const presentation = getSectionPresentation(container);
  const detailExpanded = isDetailExpanded(presentation);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'config-section-heading config-section-toggle-button';
  button.setAttribute('aria-expanded', String(detailExpanded));
  button.innerHTML = `
    <span class="config-section-toggle ${detailExpanded ? '' : 'collapsed'}">&#x25BC;</span>
    <span class="config-section-title">Git${headerSuffix}</span>
  `;
  button.addEventListener('click', () => {
    if (presentation === 'promoted') return;
    if (presentation === 'compact') compactExpanded = !compactExpanded;
    else collapsed = !collapsed;
    lastFilesKey = '';
    void refresh();
  });
  header.appendChild(button);

  const meta = document.createElement('div');
  meta.className = 'config-section-meta';
  const count = document.createElement('span');
  count.className = 'config-section-count control-chip';
  count.textContent = String(total);
  meta.appendChild(count);
  header.appendChild(meta);
}

type GitNoteTone = 'default' | 'healthy' | 'warning' | 'muted';

function renderGitBodyState(body: HTMLElement, message: string, tone: GitNoteTone = 'muted'): void {
  body.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'config-empty ops-rail-note';
  empty.dataset.tone = tone;
  empty.textContent = message;
  body.appendChild(empty);
}

function ensureGitSection(
  container: HTMLElement,
  total: number,
  headerSuffix: string,
): HTMLElement {
  const presentation = getSectionPresentation(container);
  const detailExpanded = isDetailExpanded(presentation);
  const showCompactSummary = presentation === 'compact' && !detailExpanded;
  const existingSection = container.querySelector('.config-section');
  if (existingSection) {
    const body = existingSection.querySelector('.config-section-body') as HTMLElement | null;
    const existingHeader = existingSection.querySelector('.config-section-header');
    if (existingHeader && body) {
      body.className = `config-section-body${detailExpanded || showCompactSummary ? '' : ' hidden'}`;
      updateGitHeader(existingHeader as HTMLElement, total, headerSuffix, container);
      return body;
    }
  }

  const section = document.createElement('div');
  section.className = 'config-section';

  const header = document.createElement('div');
  header.className = 'config-section-header';

  const body = document.createElement('div');
  body.className = `config-section-body${detailExpanded || showCompactSummary ? '' : ' hidden'}`;
  updateGitHeader(header, total, headerSuffix, container);

  section.appendChild(header);
  section.appendChild(body);

  container.innerHTML = '';
  container.appendChild(section);
  return body;
}

function renderWorktreeSelector(container: HTMLElement, project: { id: string; path: string }): void {
  const worktrees = getWorktrees(project.id);
  // Remove existing selector
  const existing = container.querySelector('.git-worktree-selector');
  if (existing) existing.remove();

  if (!worktrees || worktrees.length <= 1) return;

  const activeGitPath = getActiveGitPath(project.id);

  const wrapper = document.createElement('div');
  wrapper.className = 'git-worktree-selector';

  const select = document.createElement('select');
  select.className = 'git-worktree-select';

  for (const wt of worktrees) {
    if (wt.isBare) continue;
    const option = document.createElement('option');
    option.value = wt.path;
    const label = wt.branch || `detached (${wt.head.slice(0, 7)})`;
    const pathHint = wt.path === project.path ? '' : ` — ${shortPath(wt.path)}`;
    option.textContent = label + pathHint;
    option.selected = wt.path === activeGitPath;
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    setActiveWorktree(project.id, select.value);
  });

  wrapper.appendChild(select);

  // Insert after header
  const header = container.querySelector('.config-section-header');
  if (header && header.nextSibling) {
    container.querySelector('.config-section')!.insertBefore(wrapper, header.nextSibling);
  }
}

function applyGitPanelVisibility(): void {
  const container = document.getElementById('git-panel');
  if (!container) return;
  const visible = appState.preferences.sidebarViews?.gitPanel ?? true;
  container.classList.toggle('hidden', !visible);
}

/** Debounced refresh — coalesces rapid-fire events into a single render */
function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh();
  }, 100);
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
  const showCompactSummary = presentation === 'compact' && !detailExpanded;

  // Find active worktree branch for header
  let headerSuffix = '';
  if (hasMultipleWorktrees) {
    const activeWt = worktrees!.find(w => w.path === activeGitPath);
    if (activeWt?.branch) {
      headerSuffix = ` · ${esc(activeWt.branch)}`;
    }
  }

  const body = ensureGitSection(container, total, headerSuffix);

  // Add worktree selector if multiple worktrees
  if (hasMultipleWorktrees) {
    renderWorktreeSelector(container, project);
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

  const fragment = document.createDocumentFragment();

  // Group by area in display order
  const order: string[] = ['conflicted', 'staged', 'working', 'untracked'];
  const groups = new Map<string, GitFileEntry[]>();
  for (const f of files) {
    const list = groups.get(f.area) || [];
    list.push(f);
    groups.set(f.area, list);
  }

  let rendered = 0;
  for (const area of order) {
    const group = groups.get(area);
    if (!group || group.length === 0) continue;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'git-group-header';
    groupHeader.textContent = `${areaLabel(area)} (${group.length})`;
    fragment.appendChild(groupHeader);

    for (const entry of group) {
      if (rendered >= MAX_FILES) break;
      const item = document.createElement('div');
      item.className = 'config-item config-item-clickable calder-list-row';
      item.innerHTML = `${statusBadge(entry)}<span class="config-item-detail" title="${esc(entry.path)}">${esc(entry.path)}</span>`;

      // Hover action buttons
      const actions = document.createElement('span');
      actions.className = 'git-item-actions';

      if (entry.area === 'staged') {
        actions.appendChild(createActionButton('Unstage', '−', async () => {
          await window.calder.git.unstageFile(gitPath, entry.path);
          afterAction();
        }));
      } else {
        if (entry.area !== 'conflicted') {
          actions.appendChild(createActionButton('Discard Changes', '↩', async () => {
            const msg = entry.area === 'untracked'
              ? `Delete untracked file "${entry.path}"?`
              : `Discard changes to "${entry.path}"? This cannot be undone.`;
            if (confirm(msg)) {
              await window.calder.git.discardFile(gitPath, entry.path, entry.area);
              afterAction();
            }
          }));
        }
        actions.appendChild(createActionButton('Stage', '+', async () => {
          await window.calder.git.stageFile(gitPath, entry.path);
          afterAction();
        }));
      }

      item.appendChild(actions);

      item.addEventListener('click', () => showFileViewer(entry.path, entry.area, gitPath));
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGitFileContextMenu(e.clientX, e.clientY, entry, gitPath);
      });
      fragment.appendChild(item);
      rendered++;
    }
    if (rendered >= MAX_FILES) break;
  }

  const remaining = files.length - rendered;
  if (remaining > 0) {
    const overflow = document.createElement('div');
    overflow.className = 'config-empty ops-rail-note git-overflow-note';
    overflow.dataset.tone = 'muted';
    overflow.textContent = `and ${remaining} more…`;
    fragment.appendChild(overflow);
  }

  body.innerHTML = '';
  body.appendChild(fragment);
}

export function toggleGitPanel(): void {
  const container = document.getElementById('git-panel');
  if (!container || !container.firstElementChild) return;
  const presentation = getSectionPresentation(container);

  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (presentation === 'promoted') return;
  if (presentation === 'compact') compactExpanded = !compactExpanded;
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
