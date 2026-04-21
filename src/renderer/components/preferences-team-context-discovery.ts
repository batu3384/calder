import type { ProjectRecord } from '../../shared/types.js';
import { appState } from '../state.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import { setModalError, showModal } from './modal.js';

export interface RenderProjectTeamContextSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onRefreshProviders: () => void;
  onCloseModalWide: () => void;
}

export function renderProjectTeamContextSection(args: RenderProjectTeamContextSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Team context',
    'Keep repo-local team spaces, shared rules, and reusable workflows visible so every CLI starts from the same collaboration map.',
  );

  const shell = document.createElement('div');
  shell.className = 'team-context-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'team-context-discovery-empty';
    empty.textContent = 'Open a project to inspect shared team context spaces.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;

  const actions = document.createElement('div');
  actions.className = 'team-context-discovery-actions';

  const starterBtn = document.createElement('button');
  starterBtn.className = 'team-context-discovery-action-btn';
  starterBtn.type = 'button';
  starterBtn.textContent = 'Create starter spaces';
  starterBtn.addEventListener('click', async () => {
    starterBtn.disabled = true;
    try {
      const result = await window.calder.teamContext.createStarterFiles(project.path);
      appState.setProjectTeamContext(project.id, result.state);
      args.onRefreshProviders();
    } finally {
      starterBtn.disabled = false;
    }
  });
  actions.appendChild(starterBtn);

  const createSpaceBtn = document.createElement('button');
  createSpaceBtn.className = 'team-context-discovery-action-btn';
  createSpaceBtn.type = 'button';
  createSpaceBtn.textContent = 'New shared space';
  createSpaceBtn.addEventListener('click', () => {
    showModal('New Shared Team Space', [
      {
        label: 'Space title',
        id: 'team-context-title',
        placeholder: 'Frontend alignment',
        defaultValue: 'Team Space',
      },
    ], async (values) => {
      const title = values['team-context-title']?.trim() ?? '';
      if (!title) {
        setModalError('team-context-title', 'Space title is required');
        return;
      }

      const result = await window.calder.teamContext.createSpace(project.path, title);
      appState.setProjectTeamContext(project.id, result.state);
      args.onCloseModalWide();

      const relativePath = toProjectRelativeContextPath(project.path, `${project.path}/${result.relativePath}`);
      if (relativePath) {
        await window.calder.git.openInEditor(project.path, relativePath);
      }
    });
  });
  actions.appendChild(createSpaceBtn);
  shell.appendChild(actions);

  const projectTeamContext = project.projectTeamContext;
  if (
    !projectTeamContext ||
    (projectTeamContext.spaces.length === 0 &&
      projectTeamContext.sharedRuleCount === 0 &&
      projectTeamContext.workflowCount === 0)
  ) {
    const empty = document.createElement('div');
    empty.className = 'team-context-discovery-empty';
    empty.textContent = 'No shared team context has been discovered for this repo yet.';
    shell.appendChild(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'team-context-discovery-summary';
  summary.innerHTML = `
      <div class="team-context-discovery-stat">
        <span class="team-context-discovery-stat-label">Spaces</span>
        <span class="team-context-discovery-stat-value">${projectTeamContext.spaces.length}</span>
      </div>
      <div class="team-context-discovery-stat">
        <span class="team-context-discovery-stat-label">Shared rules</span>
        <span class="team-context-discovery-stat-value">${projectTeamContext.sharedRuleCount}</span>
      </div>
      <div class="team-context-discovery-stat">
        <span class="team-context-discovery-stat-label">Workflows</span>
        <span class="team-context-discovery-stat-value">${projectTeamContext.workflowCount}</span>
      </div>
    `;
  shell.appendChild(summary);

  if (projectTeamContext.spaces.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'team-context-discovery-empty';
    empty.textContent = 'Shared rules or workflows exist, but no team context spaces have been created yet.';
    shell.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'team-context-discovery-list';
  for (const space of projectTeamContext.spaces.slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'team-context-discovery-item';

    const header = document.createElement('div');
    header.className = 'team-context-discovery-item-header';

    const title = document.createElement('div');
    title.className = 'team-context-discovery-item-title';
    title.textContent = space.displayName;
    header.appendChild(title);

    const itemActions = document.createElement('div');
    itemActions.className = 'team-context-discovery-item-actions';

    const status = document.createElement('div');
    status.className = 'team-context-discovery-item-status';
    status.textContent = `${space.linkedRuleCount} rule${space.linkedRuleCount === 1 ? '' : 's'} · ${space.linkedWorkflowCount} workflow${space.linkedWorkflowCount === 1 ? '' : 's'}`;

    const previewBtn = document.createElement('button');
    previewBtn.className = 'team-context-discovery-item-btn';
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => {
      appState.addFileReaderSession(project.id, space.path);
      args.onCloseModalWide();
    });
    itemActions.appendChild(previewBtn);

    const relativePath = toProjectRelativeContextPath(project.path, space.path);
    if (relativePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'team-context-discovery-item-btn';
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
    meta.className = 'team-context-discovery-item-meta';
    meta.textContent = space.summary
      ? `Shared team space · ${space.summary}`
      : 'Shared team space';
    item.appendChild(meta);

    list.appendChild(item);
  }

  shell.appendChild(list);
}
