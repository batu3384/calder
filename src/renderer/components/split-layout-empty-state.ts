import { ProjectRecord } from '../state.js';

export function removeEmptyState(container: ParentNode): void {
  container.querySelector('.empty-state')?.remove();
}

export function showEmptyState(
  container: HTMLElement,
  project: ProjectRecord | undefined,
  onCreateProject: () => void,
  onStartFirstSession: () => void,
): void {
  removeEmptyState(container);
  const el = document.createElement('div');
  el.className = 'empty-state';

  const card = document.createElement('div');
  card.className = 'empty-state-card';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'empty-state-eyebrow';

  const title = document.createElement('div');
  title.className = 'empty-state-title';

  const copy = document.createElement('div');
  copy.className = 'empty-state-copy';

  const detail = document.createElement('div');
  detail.className = 'empty-state-detail';

  const actions = document.createElement('div');
  actions.className = 'empty-state-actions';

  const primary = document.createElement('button');
  primary.id = 'empty-state-primary-action';
  primary.className = 'empty-state-primary-action';

  if (!project) {
    eyebrow.textContent = 'Launchpad';
    title.textContent = 'Open a project or start a live run';
    copy.textContent = 'Pick a coding tool, open Live View, or resume recent sessions from one desk.';
    detail.textContent = 'Browser context stays on the left. Sessions and project signals stack on the right.';
    primary.textContent = 'Create Project';
    primary.addEventListener('click', onCreateProject);
  } else {
    eyebrow.textContent = 'Project ready';
    title.textContent = 'Start a run or open Live View';
    copy.textContent = 'Bring up a coding tool, inspect a page, or continue recent work from this project.';
    detail.textContent = `${project.path} · Live View stays pinned while sessions share the same project context.`;
    primary.textContent = 'Start First Session';
    primary.addEventListener('click', onStartFirstSession);
  }

  actions.appendChild(primary);
  card.appendChild(eyebrow);
  card.appendChild(title);
  card.appendChild(copy);
  card.appendChild(detail);
  card.appendChild(actions);
  el.appendChild(card);
  container.appendChild(el);
}
