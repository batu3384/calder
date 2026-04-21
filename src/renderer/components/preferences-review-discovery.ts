import type { ProjectRecord } from '../../shared/types.js';
import { appState } from '../state.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import { sendProjectReviewToSelectedSession } from '../project-review-actions.js';
import { setModalError, showModal } from './modal.js';

export interface RenderProjectReviewSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onCloseModalWide: () => void;
}

export function renderProjectReviewSection(args: RenderProjectReviewSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Review findings',
    'Keep saved PR review notes close to the workspace, preview them quickly, and send the next fix pass straight into the selected session.',
  );

  const shell = document.createElement('div');
  shell.className = 'review-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'review-discovery-empty';
    empty.textContent = 'Open a project to manage saved PR review notes.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;

  const actions = document.createElement('div');
  actions.className = 'review-discovery-actions';

  const createBtn = document.createElement('button');
  createBtn.className = 'review-discovery-action-btn';
  createBtn.type = 'button';
  createBtn.textContent = 'New findings file';
  createBtn.addEventListener('click', () => {
    showModal('New Review Findings', [
      {
        label: 'Findings title',
        id: 'review-title',
        placeholder: 'PR 42 Findings',
        defaultValue: 'PR Review Findings',
      },
    ], async (values) => {
      const title = values['review-title']?.trim() ?? '';
      if (!title) {
        setModalError('review-title', 'Findings title is required');
        return;
      }

      const result = await window.calder.review.createFile(project.path, title);
      appState.setProjectReviews(project.id, result.state);
      args.onCloseModalWide();

      const relativePath = toProjectRelativeContextPath(project.path, `${project.path}/${result.relativePath}`);
      if (relativePath) {
        await window.calder.git.openInEditor(project.path, relativePath);
      }
    });
  });
  actions.appendChild(createBtn);
  shell.appendChild(actions);

  const projectReviews = project.projectReviews;
  if (!projectReviews || projectReviews.reviews.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'review-discovery-empty';
    empty.textContent = 'No saved review findings have been discovered for this repo yet.';
    shell.appendChild(empty);
    return;
  }

  const selectedFixSession = appState.resolveSurfaceTargetSession(project.id);
  const summary = document.createElement('div');
  summary.className = 'review-discovery-summary';
  summary.innerHTML = `
      <div class="review-discovery-stat">
        <span class="review-discovery-stat-label">Project</span>
        <span class="review-discovery-stat-value">${project.name}</span>
      </div>
      <div class="review-discovery-stat">
        <span class="review-discovery-stat-label">Findings</span>
        <span class="review-discovery-stat-value">${projectReviews.reviews.length}</span>
      </div>
      <div class="review-discovery-stat">
        <span class="review-discovery-stat-label">Fix target</span>
        <span class="review-discovery-stat-value">${selectedFixSession?.name ?? 'No CLI session'}</span>
      </div>
    `;
  shell.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'review-discovery-list';
  for (const review of projectReviews.reviews.slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'review-discovery-item';

    const header = document.createElement('div');
    header.className = 'review-discovery-item-header';

    const title = document.createElement('div');
    title.className = 'review-discovery-item-title';
    title.textContent = review.displayName;
    header.appendChild(title);

    const itemActions = document.createElement('div');
    itemActions.className = 'review-discovery-item-actions';

    const status = document.createElement('div');
    status.className = 'review-discovery-item-status';
    status.textContent = selectedFixSession ? `Selected: ${selectedFixSession.name}` : 'Open a CLI session first';

    const fixBtn = document.createElement('button');
    fixBtn.className = 'review-discovery-item-btn';
    fixBtn.type = 'button';
    fixBtn.textContent = 'Fix in selected session';
    fixBtn.disabled = !selectedFixSession;
    fixBtn.addEventListener('click', async () => {
      fixBtn.disabled = true;
      try {
        const reviewDocument = await window.calder.review.readFile(project.path, review.path);
        const result = await sendProjectReviewToSelectedSession(project.id, reviewDocument);
        if (!result.ok) {
          status.textContent = result.error ?? 'Unable to send findings.';
          return;
        }
        args.onCloseModalWide();
      } finally {
        fixBtn.disabled = !selectedFixSession;
      }
    });
    itemActions.appendChild(fixBtn);

    const previewBtn = document.createElement('button');
    previewBtn.className = 'review-discovery-item-btn';
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => {
      appState.addFileReaderSession(project.id, review.path);
      args.onCloseModalWide();
    });
    itemActions.appendChild(previewBtn);

    const relativePath = toProjectRelativeContextPath(project.path, review.path);
    if (relativePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'review-discovery-item-btn';
      openBtn.type = 'button';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', async () => {
        openBtn.disabled = true;
        try {
          await window.calder.git.openInEditor(project.path, relativePath);
        } finally {
          openBtn.disabled = false;
        }
      });
      itemActions.appendChild(openBtn);
    }

    itemActions.appendChild(status);
    header.appendChild(itemActions);
    item.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'review-discovery-item-meta';
    meta.textContent = review.summary ? `Saved PR review notes · ${review.summary}` : 'Saved PR review notes';
    item.appendChild(meta);

    list.appendChild(item);
  }

  shell.appendChild(list);
}
