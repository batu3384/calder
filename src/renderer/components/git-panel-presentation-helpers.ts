export type SectionPresentation = 'compact' | 'expanded' | 'promoted' | 'ultra';
type GitNoteTone = 'default' | 'healthy' | 'warning' | 'muted';

type WorktreeRef = {
  path: string;
  branch?: string;
  head: string;
  isBare: boolean;
};

type ProjectRef = {
  id: string;
  path: string;
};

interface EnsureGitSectionArgs {
  container: HTMLElement;
  total: number;
  headerSuffix: string;
  detailExpanded: boolean;
  showCompactSummary: boolean;
  onToggle: () => void;
}

interface RenderWorktreeSelectorArgs {
  container: HTMLElement;
  project: ProjectRef;
  worktrees: WorktreeRef[] | undefined;
  activeGitPath: string;
  onSelectWorktree: (projectId: string, worktreePath: string) => void;
}

export function esc(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

export function shortPath(fullPath: string): string {
  const parts = fullPath.split('/');
  return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : fullPath;
}

export function getSectionPresentation(container: HTMLElement): SectionPresentation {
  const wrapper = container.parentNode as { dataset?: Record<string, string> } | null;
  const value = wrapper?.dataset?.presentation;
  return value === 'compact' || value === 'promoted' || value === 'expanded' || value === 'ultra'
    ? value
    : 'expanded';
}

export function getCompactSummary(total: number, conflicted: number): string {
  if (total === 0) return 'Git is clean';
  if (conflicted > 0) {
    return conflicted === 1 ? '1 conflicted file needs review' : `${conflicted} conflicted files need review`;
  }
  return total === 1 ? '1 file changed' : `${total} files changed`;
}

export function renderGitBodyState(body: HTMLElement, message: string, tone: GitNoteTone = 'muted'): void {
  body.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'config-empty ops-rail-note';
  empty.dataset.tone = tone;
  empty.textContent = message;
  body.appendChild(empty);
}

function updateGitHeader(
  header: HTMLElement,
  total: number,
  headerSuffix: string,
  detailExpanded: boolean,
  onToggle: () => void,
): void {
  header.innerHTML = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'config-section-heading config-section-toggle-button';
  button.setAttribute('aria-expanded', String(detailExpanded));
  button.innerHTML = `
    <span class="config-section-toggle ${detailExpanded ? '' : 'collapsed'}">&#x25BC;</span>
    <span class="config-section-title">Git${headerSuffix}</span>
  `;
  button.addEventListener('click', onToggle);
  header.appendChild(button);

  const meta = document.createElement('div');
  meta.className = 'config-section-meta';
  const count = document.createElement('span');
  count.className = 'config-section-count control-chip';
  count.textContent = String(total);
  meta.appendChild(count);
  header.appendChild(meta);
}

export function ensureGitSection(args: EnsureGitSectionArgs): HTMLElement {
  const {
    container,
    total,
    headerSuffix,
    detailExpanded,
    showCompactSummary,
    onToggle,
  } = args;
  const existingSection = container.querySelector('.config-section');
  if (existingSection) {
    const body = existingSection.querySelector('.config-section-body') as HTMLElement | null;
    const existingHeader = existingSection.querySelector('.config-section-header');
    if (existingHeader && body) {
      body.className = `config-section-body${detailExpanded || showCompactSummary ? '' : ' hidden'}`;
      updateGitHeader(existingHeader as HTMLElement, total, headerSuffix, detailExpanded, onToggle);
      return body;
    }
  }

  const section = document.createElement('div');
  section.className = 'config-section';

  const header = document.createElement('div');
  header.className = 'config-section-header';

  const body = document.createElement('div');
  body.className = `config-section-body${detailExpanded || showCompactSummary ? '' : ' hidden'}`;
  updateGitHeader(header, total, headerSuffix, detailExpanded, onToggle);

  section.appendChild(header);
  section.appendChild(body);

  container.innerHTML = '';
  container.appendChild(section);
  return body;
}

export function renderWorktreeSelector(args: RenderWorktreeSelectorArgs): void {
  const {
    container,
    project,
    worktrees,
    activeGitPath,
    onSelectWorktree,
  } = args;

  const existing = container.querySelector('.git-worktree-selector');
  if (existing) existing.remove();

  if (!worktrees || worktrees.length <= 1) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'git-worktree-selector';

  const select = document.createElement('select');
  select.className = 'git-worktree-select';

  for (const worktree of worktrees) {
    if (worktree.isBare) continue;
    const option = document.createElement('option');
    option.value = worktree.path;
    const label = worktree.branch || `detached (${worktree.head.slice(0, 7)})`;
    const pathHint = worktree.path === project.path ? '' : ` — ${shortPath(worktree.path)}`;
    option.textContent = label + pathHint;
    option.selected = worktree.path === activeGitPath;
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    onSelectWorktree(project.id, select.value);
  });

  wrapper.appendChild(select);

  const header = container.querySelector('.config-section-header');
  if (header && header.nextSibling) {
    container.querySelector('.config-section')!.insertBefore(wrapper, header.nextSibling);
  }
}
