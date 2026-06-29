import type { ProjectBackgroundTaskDocument, ProjectBackgroundTaskSource, ProjectBackgroundTaskState } from '../../../shared/types/project-background-task.js';
import type { ProjectRecord } from '../../../shared/types/project-state.js';
import {
  resumeProjectBackgroundTaskInNewSession,
  sendProjectBackgroundTaskToSelectedSession,
} from '../../project-background-task-actions.js';
import { toProjectRelativeContextPath } from '../../project-context-utils.js';
import { appState } from '../../state.js';
import { setModalError, showModal } from '../modal.js';

export interface RenderProjectBackgroundTaskSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onCloseModalWide: () => void;
  modalBody: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  registerModalCleanup: (cleanup: () => void) => void;
}

interface BackgroundTaskDetailsContext {
  projectPath: string;
  projectId: string;
  onCloseModalWide: () => void;
  modalBody: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  registerModalCleanup: (cleanup: () => void) => void;
}

interface BackgroundTaskListContext {
  project: ProjectRecord;
  selectedTaskSession: ReturnType<typeof appState.resolveSurfaceTargetSession>;
  onCloseModalWide: () => void;
  showBackgroundTaskDetails: (taskDocument: ProjectBackgroundTaskDocument) => void;
}

function appendTaskDiscoveryEmptyState(shell: HTMLElement, message: string): void {
  const empty = document.createElement('div');
  empty.className = 'task-discovery-empty';
  empty.textContent = message;
  shell.appendChild(empty);
}

function createTaskDiscoveryShell(card: HTMLElement): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'task-discovery-shell';
  card.appendChild(shell);
  return shell;
}

export function resolveBackgroundTaskArtifactPath(
  projectPath: string,
  artifactPath: string,
): { fullPath: string; relativePath: string | null } {
  const isAbsolute = artifactPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(artifactPath);
  const normalizedProject = projectPath.replace(/[\\/]+$/, '');
  const fullPath = isAbsolute
    ? artifactPath
    : `${normalizedProject}/${artifactPath.replace(/^\.?[\\/]/, '').replace(/\\/g, '/')}`;
  return {
    fullPath,
    relativePath: toProjectRelativeContextPath(projectPath, fullPath),
  };
}

function createTaskDetailsArtifactList(
  taskDocument: ProjectBackgroundTaskDocument,
  context: BackgroundTaskDetailsContext,
): HTMLElement | null {
  if (taskDocument.artifacts.length === 0) {
    return null;
  }

  const artifactBlock = document.createElement('div');
  artifactBlock.className = 'checkpoint-restore-confirm-file-block';

  const artifactTitle = document.createElement('div');
  artifactTitle.className = 'checkpoint-restore-confirm-fact-label';
  artifactTitle.textContent = 'Artifacts';
  artifactBlock.appendChild(artifactTitle);

  const artifactList = document.createElement('div');
  artifactList.className = 'checkpoint-restore-confirm-file-list';

  for (const artifact of taskDocument.artifacts) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'checkpoint-restore-confirm-file-item';

    const pathEl = document.createElement('div');
    pathEl.className = 'checkpoint-restore-confirm-file-path';
    pathEl.textContent = artifact;
    item.appendChild(pathEl);

    item.addEventListener('click', async () => {
      const resolved = resolveBackgroundTaskArtifactPath(context.projectPath, artifact);
      if (resolved.relativePath) {
        await window.calder.git.openInEditor(context.projectPath, resolved.relativePath);
      } else {
        appState.addFileReaderSession(context.projectId, resolved.fullPath);
      }
      context.onCloseModalWide();
    });

    artifactList.appendChild(item);
  }

  artifactBlock.appendChild(artifactList);
  return artifactBlock;
}

function renderBackgroundTaskDetails(taskDocument: ProjectBackgroundTaskDocument, context: BackgroundTaskDetailsContext): void {
  showModal('Background Task Details', [], async () => {
    context.onCloseModalWide();
  });

  const previousConfirmText = context.confirmButton.textContent;
  const previousCancelText = context.cancelButton.textContent;
  context.confirmButton.textContent = 'Close';
  context.cancelButton.textContent = 'Back';

  context.registerModalCleanup(() => {
    context.confirmButton.textContent = previousConfirmText;
    context.cancelButton.textContent = previousCancelText;
  });

  const detailsShell = document.createElement('div');
  detailsShell.className = 'checkpoint-restore-confirm';

  const copy = document.createElement('div');
  copy.className = 'checkpoint-restore-confirm-copy';

  const title = document.createElement('div');
  title.className = 'checkpoint-restore-confirm-title';
  title.textContent = taskDocument.title;
  copy.appendChild(title);

  const description = document.createElement('div');
  description.className = 'checkpoint-restore-confirm-description';
  description.textContent = taskDocument.prompt;
  copy.appendChild(description);
  detailsShell.appendChild(copy);

  const facts = document.createElement('div');
  facts.className = 'checkpoint-restore-confirm-facts';
  const statusFact = document.createElement('div');
  statusFact.className = 'checkpoint-restore-confirm-fact';
  statusFact.innerHTML = `
      <span class="checkpoint-restore-confirm-fact-label">Status</span>
      <span class="checkpoint-restore-confirm-fact-value">${taskDocument.status}</span>
    `;
  facts.appendChild(statusFact);

  if (taskDocument.handoff.trim()) {
    const handoffFact = document.createElement('div');
    handoffFact.className = 'checkpoint-restore-confirm-fact';
    handoffFact.innerHTML = `
        <span class="checkpoint-restore-confirm-fact-label">Handoff</span>
        <span class="checkpoint-restore-confirm-fact-value">${taskDocument.handoff}</span>
      `;
    facts.appendChild(handoffFact);
  }
  detailsShell.appendChild(facts);

  const artifactBlock = createTaskDetailsArtifactList(taskDocument, context);
  if (artifactBlock) {
    detailsShell.appendChild(artifactBlock);
  }

  context.modalBody.appendChild(detailsShell);
}

function createNewQueuedTaskButton(
  project: ProjectRecord,
  onCloseModalWide: () => void,
): HTMLButtonElement {
  const createBtn = document.createElement('button');
  createBtn.className = 'task-discovery-action-btn';
  createBtn.type = 'button';
  createBtn.textContent = 'New queued task';
  createBtn.addEventListener('click', () => {
    showModal(
      'New Queued Task',
      [
        {
          label: 'Task title',
          id: 'task-title',
          placeholder: 'Audit onboarding flow',
          defaultValue: 'Queued Background Task',
        },
        {
          label: 'Task prompt',
          id: 'task-prompt',
          placeholder: 'Describe the work that should be picked up later',
        },
      ],
      async (values) => {
        const title = values['task-title']?.trim() ?? '';
        const prompt = values['task-prompt']?.trim() ?? '';
        if (!title) {
          setModalError('task-title', 'Task title is required');
          return;
        }
        if (!prompt) {
          setModalError('task-prompt', 'Task prompt is required');
          return;
        }

        const result = await window.calder.task.create(project.path, title, prompt);
        appState.setProjectBackgroundTasks(project.id, result.state);
        onCloseModalWide();

        const relativePath = toProjectRelativeContextPath(project.path, `${project.path}/${result.relativePath}`);
        if (relativePath) {
          await window.calder.git.openInEditor(project.path, relativePath);
        }
      },
    );
  });

  return createBtn;
}

function appendTaskSummary(shell: HTMLElement, state: ProjectBackgroundTaskState): void {
  const summary = document.createElement('div');
  summary.className = 'task-discovery-summary';
  summary.innerHTML = `
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Queued</span>
        <span class="task-discovery-stat-value">${state.queuedCount}</span>
      </div>
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Running</span>
        <span class="task-discovery-stat-value">${state.runningCount}</span>
      </div>
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Completed</span>
        <span class="task-discovery-stat-value">${state.completedCount}</span>
      </div>
    `;
  shell.appendChild(summary);
}

function createTaskStatusLabel(
  selectedTaskSession: ReturnType<typeof appState.resolveSurfaceTargetSession>,
): HTMLDivElement {
  const status = document.createElement('div');
  status.className = 'task-discovery-item-status';
  status.textContent = selectedTaskSession ? `Selected: ${selectedTaskSession.name}` : 'Open a CLI session first';
  return status;
}

function createTakeOverButton(
  task: ProjectBackgroundTaskSource,
  context: BackgroundTaskListContext,
  status: HTMLDivElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'task-discovery-item-btn';
  button.type = 'button';
  button.textContent = 'Take over';
  button.disabled = !context.selectedTaskSession;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const taskDocument = await window.calder.task.read(context.project.path, task.path);
      const result = await sendProjectBackgroundTaskToSelectedSession(context.project.id, taskDocument);
      if (!result.ok) {
        status.textContent = result.error ?? 'Unable to send queued task.';
        return;
      }
      context.onCloseModalWide();
    } finally {
      button.disabled = !context.selectedTaskSession;
    }
  });
  return button;
}

function createResumeButton(
  task: ProjectBackgroundTaskSource,
  context: BackgroundTaskListContext,
  status: HTMLDivElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'task-discovery-item-btn';
  button.type = 'button';
  button.textContent = 'Resume';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const taskDocument = await window.calder.task.read(context.project.path, task.path);
      const result = resumeProjectBackgroundTaskInNewSession(context.project.id, taskDocument);
      if (!result.ok) {
        status.textContent = result.error ?? 'Unable to resume task.';
        return;
      }
      context.onCloseModalWide();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function createPreviewButton(task: ProjectBackgroundTaskSource, context: BackgroundTaskListContext): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'task-discovery-item-btn';
  button.type = 'button';
  button.textContent = 'Preview';
  button.addEventListener('click', () => {
    appState.addFileReaderSession(context.project.id, task.path);
    context.onCloseModalWide();
  });
  return button;
}

function createArtifactsButton(task: ProjectBackgroundTaskSource, context: BackgroundTaskListContext): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'task-discovery-item-btn';
  button.type = 'button';
  button.textContent = 'Artifacts';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const taskDocument = await window.calder.task.read(context.project.path, task.path);
      context.showBackgroundTaskDetails(taskDocument);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function createOpenButton(relativePath: string, context: BackgroundTaskListContext): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'task-discovery-item-btn';
  button.type = 'button';
  button.textContent = 'Open';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await window.calder.git.openInEditor(context.project.path, relativePath);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

export function buildBackgroundTaskMetaText(task: ProjectBackgroundTaskSource): string {
  const artifactLabel = task.artifactCount === 1 ? '1 artifact' : `${task.artifactCount} artifacts`;
  return task.summary ? `${task.status} · ${artifactLabel} · ${task.summary}` : `${task.status} · ${artifactLabel}`;
}

function createTaskListItem(task: ProjectBackgroundTaskSource, context: BackgroundTaskListContext): HTMLElement {
  const item = document.createElement('div');
  item.className = 'task-discovery-item';

  const header = document.createElement('div');
  header.className = 'task-discovery-item-header';

  const title = document.createElement('div');
  title.className = 'task-discovery-item-title';
  title.textContent = task.title;
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'task-discovery-item-actions';

  const status = createTaskStatusLabel(context.selectedTaskSession);
  actions.appendChild(createTakeOverButton(task, context, status));
  actions.appendChild(createResumeButton(task, context, status));
  actions.appendChild(createPreviewButton(task, context));

  if (task.artifactCount > 0 || task.handoffSummary) {
    actions.appendChild(createArtifactsButton(task, context));
  }

  const relativePath = toProjectRelativeContextPath(context.project.path, task.path);
  if (relativePath) {
    actions.appendChild(createOpenButton(relativePath, context));
  }

  actions.appendChild(status);
  header.appendChild(actions);
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'task-discovery-item-meta';
  meta.textContent = buildBackgroundTaskMetaText(task);
  item.appendChild(meta);

  if (task.handoffSummary) {
    const handoff = document.createElement('div');
    handoff.className = 'task-discovery-item-meta';
    handoff.textContent = `Handoff: ${task.handoffSummary}`;
    item.appendChild(handoff);
  }

  return item;
}

function createTaskList(tasks: ProjectBackgroundTaskSource[], context: BackgroundTaskListContext): HTMLElement {
  const list = document.createElement('div');
  list.className = 'task-discovery-list';
  for (const task of tasks.slice(0, 6)) {
    list.appendChild(createTaskListItem(task, context));
  }
  return list;
}

export function renderProjectBackgroundTaskSection(args: RenderProjectBackgroundTaskSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Background agents',
    'Queue safe local work items in .calder/tasks, preview them, and take one over in the selected CLI session when you are ready.',
  );
  const shell = createTaskDiscoveryShell(card);
  if (!args.project) {
    appendTaskDiscoveryEmptyState(shell, 'Open a project to manage queued background tasks.');
    return;
  }

  const project = args.project;
  const actions = document.createElement('div');
  actions.className = 'task-discovery-actions';
  actions.appendChild(createNewQueuedTaskButton(project, args.onCloseModalWide));
  shell.appendChild(actions);

  const projectBackgroundTasks = project.projectBackgroundTasks;
  if (!projectBackgroundTasks || projectBackgroundTasks.tasks.length === 0) {
    appendTaskDiscoveryEmptyState(shell, 'No queued background tasks have been discovered for this repo yet.');
    return;
  }

  appendTaskSummary(shell, projectBackgroundTasks);

  const detailsContext: BackgroundTaskDetailsContext = {
    projectPath: project.path,
    projectId: project.id,
    onCloseModalWide: args.onCloseModalWide,
    modalBody: args.modalBody,
    confirmButton: args.confirmButton,
    cancelButton: args.cancelButton,
    registerModalCleanup: args.registerModalCleanup,
  };
  const listContext: BackgroundTaskListContext = {
    project,
    selectedTaskSession: appState.resolveSurfaceTargetSession(project.id),
    onCloseModalWide: args.onCloseModalWide,
    showBackgroundTaskDetails: (taskDocument) => renderBackgroundTaskDetails(taskDocument, detailsContext),
  };
  shell.appendChild(createTaskList(projectBackgroundTasks.tasks, listContext));
}
