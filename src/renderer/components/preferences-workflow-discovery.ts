import type { ProjectRecord } from '../../shared/types/project.js';
import { appState } from '../state.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import { setModalError, showModal } from './modal.js';

export interface RenderProjectWorkflowSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onRefreshProviders: () => void;
  onCloseModalWide: () => void;
}

export function renderProjectWorkflowSection(args: RenderProjectWorkflowSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Workflow templates',
    'Keep reusable workflows in the repo so repeated tasks start from the same playbook instead of a blank prompt.',
  );

  const shell = document.createElement('div');
  shell.className = 'workflow-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'workflow-discovery-empty';
    empty.textContent = 'Open a project to inspect and manage reusable workflows for this repo.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;

  const actions = document.createElement('div');
  actions.className = 'workflow-discovery-actions';

  const starterBtn = document.createElement('button');
  starterBtn.className = 'workflow-discovery-action-btn';
  starterBtn.type = 'button';
  starterBtn.textContent = 'Create starter workflows';
  starterBtn.addEventListener('click', async () => {
    starterBtn.disabled = true;
    starterBtn.textContent = 'Creating…';
    try {
      const result = await window.calder.workflow.createStarterFiles(project.path);
      appState.setProjectWorkflows(project.id, result.state);
      args.onRefreshProviders();
    } catch {
      starterBtn.disabled = false;
      starterBtn.textContent = 'Create starter workflows';
    }
  });
  actions.appendChild(starterBtn);

  const createWorkflowBtn = document.createElement('button');
  createWorkflowBtn.className = 'workflow-discovery-action-btn';
  createWorkflowBtn.type = 'button';
  createWorkflowBtn.textContent = 'New workflow';
  createWorkflowBtn.addEventListener('click', () => {
    showModal('New Workflow', [
      {
        label: 'Workflow name',
        id: 'workflow-name',
        placeholder: 'Incident triage',
        defaultValue: 'Incident triage',
      },
    ], async (values) => {
      const title = values['workflow-name']?.trim() ?? '';
      if (!title) {
        setModalError('workflow-name', 'Workflow name is required');
        return;
      }

      const result = await window.calder.workflow.createFile(project.path, title);
      appState.setProjectWorkflows(project.id, result.state);
      args.onCloseModalWide();
      void window.calder.git.openInEditor(project.path, result.relativePath);
    });
  });
  actions.appendChild(createWorkflowBtn);
  shell.appendChild(actions);

  const projectWorkflows = project.projectWorkflows;
  if (!projectWorkflows || projectWorkflows.workflows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'workflow-discovery-empty';
    empty.textContent = 'No reusable workflows have been discovered for this repo yet.';
    shell.appendChild(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'workflow-discovery-summary';
  summary.innerHTML = `
      <div class="workflow-discovery-stat">
        <span class="workflow-discovery-stat-label">Project</span>
        <span class="workflow-discovery-stat-value">${project.name}</span>
      </div>
      <div class="workflow-discovery-stat">
        <span class="workflow-discovery-stat-label">Workflows</span>
        <span class="workflow-discovery-stat-value">${projectWorkflows.workflows.length}</span>
      </div>
      <div class="workflow-discovery-stat">
        <span class="workflow-discovery-stat-label">Mode</span>
        <span class="workflow-discovery-stat-value">Repo playbooks</span>
      </div>
    `;
  shell.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'workflow-discovery-list';
  for (const workflow of projectWorkflows.workflows.slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'workflow-discovery-item';

    const header = document.createElement('div');
    header.className = 'workflow-discovery-item-header';

    const title = document.createElement('div');
    title.className = 'workflow-discovery-item-title';
    title.textContent = workflow.displayName;
    header.appendChild(title);

    const status = document.createElement('div');
    status.className = 'workflow-discovery-item-status';
    status.textContent = 'Reusable workflow';

    const itemActions = document.createElement('div');
    itemActions.className = 'workflow-discovery-item-actions';

    const runBtn = document.createElement('button');
    runBtn.className = 'workflow-discovery-item-btn';
    runBtn.type = 'button';
    runBtn.textContent = 'Run';
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      try {
        const workflowDocument = await window.calder.workflow.readFile(project.path, workflow.path);
        appState.launchWorkflowSession(project.id, workflowDocument);
        args.onCloseModalWide();
      } finally {
        runBtn.disabled = false;
      }
    });
    itemActions.appendChild(runBtn);

    const previewBtn = document.createElement('button');
    previewBtn.className = 'workflow-discovery-item-btn';
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => {
      appState.addFileReaderSession(project.id, workflow.path);
      args.onCloseModalWide();
    });
    itemActions.appendChild(previewBtn);

    const relativePath = toProjectRelativeContextPath(project.path, workflow.path);
    if (relativePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'workflow-discovery-item-btn';
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
    if (itemActions.childElementCount > 0) {
      header.appendChild(itemActions);
    }
    item.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'workflow-discovery-item-meta';
    meta.textContent = workflow.summary
      ? `Reusable workflow · ${workflow.summary}`
      : 'Reusable workflow';
    item.appendChild(meta);

    list.appendChild(item);
  }

  shell.appendChild(list);
}
