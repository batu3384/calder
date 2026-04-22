import type { ProjectBackgroundTaskDocument, ProjectRecord } from '../../shared/types/project.js';
import { appState } from '../state.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import {
  resumeProjectBackgroundTaskInNewSession,
  sendProjectBackgroundTaskToSelectedSession,
} from '../project-background-task-actions.js';
import { closeModal, setModalError, showModal } from './modal.js';

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

export function renderProjectBackgroundTaskSection(args: RenderProjectBackgroundTaskSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Background agents',
    'Queue safe local work items in .calder/tasks, preview them, and take one over in the selected CLI session when you are ready.',
  );

  const shell = document.createElement('div');
  shell.className = 'task-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'task-discovery-empty';
    empty.textContent = 'Open a project to manage queued background tasks.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;
  const projectPath = project.path;
  const projectId = project.id;

  const actions = document.createElement('div');
  actions.className = 'task-discovery-actions';

  function resolveArtifactPath(artifactPath: string): { fullPath: string; relativePath: string | null } {
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

  function showBackgroundTaskDetails(taskDocument: ProjectBackgroundTaskDocument): void {
    showModal('Background Task Details', [], async () => {
      args.onCloseModalWide();
    });

    const previousConfirmText = args.confirmButton.textContent;
    const previousCancelText = args.cancelButton.textContent;
    args.confirmButton.textContent = 'Close';
    args.cancelButton.textContent = 'Back';

    args.registerModalCleanup(() => {
      args.confirmButton.textContent = previousConfirmText;
      args.cancelButton.textContent = previousCancelText;
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

    if (taskDocument.artifacts.length > 0) {
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
          const resolved = resolveArtifactPath(artifact);
          if (resolved.relativePath) {
            await window.calder.git.openInEditor(projectPath, resolved.relativePath);
          } else {
            appState.addFileReaderSession(projectId, resolved.fullPath);
          }
          args.onCloseModalWide();
        });

        artifactList.appendChild(item);
      }

      artifactBlock.appendChild(artifactList);
      detailsShell.appendChild(artifactBlock);
    }

    args.modalBody.appendChild(detailsShell);
  }

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

        const result = await window.calder.task.create(projectPath, title, prompt);
        appState.setProjectBackgroundTasks(projectId, result.state);
        args.onCloseModalWide();

        const relativePath = toProjectRelativeContextPath(projectPath, `${projectPath}/${result.relativePath}`);
        if (relativePath) {
          await window.calder.git.openInEditor(projectPath, relativePath);
        }
      },
    );
  });
  actions.appendChild(createBtn);
  shell.appendChild(actions);

  const projectBackgroundTasks = project.projectBackgroundTasks;
  if (!projectBackgroundTasks || projectBackgroundTasks.tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'task-discovery-empty';
    empty.textContent = 'No queued background tasks have been discovered for this repo yet.';
    shell.appendChild(empty);
    return;
  }

  const selectedTaskSession = appState.resolveSurfaceTargetSession(projectId);
  const summary = document.createElement('div');
  summary.className = 'task-discovery-summary';
  summary.innerHTML = `
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Queued</span>
        <span class="task-discovery-stat-value">${projectBackgroundTasks.queuedCount}</span>
      </div>
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Running</span>
        <span class="task-discovery-stat-value">${projectBackgroundTasks.runningCount}</span>
      </div>
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Completed</span>
        <span class="task-discovery-stat-value">${projectBackgroundTasks.completedCount}</span>
      </div>
    `;
  shell.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'task-discovery-list';
  for (const task of projectBackgroundTasks.tasks.slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'task-discovery-item';

    const header = document.createElement('div');
    header.className = 'task-discovery-item-header';

    const title = document.createElement('div');
    title.className = 'task-discovery-item-title';
    title.textContent = task.title;
    header.appendChild(title);

    const itemActions = document.createElement('div');
    itemActions.className = 'task-discovery-item-actions';

    const status = document.createElement('div');
    status.className = 'task-discovery-item-status';
    status.textContent = selectedTaskSession ? `Selected: ${selectedTaskSession.name}` : 'Open a CLI session first';

    const takeOverBtn = document.createElement('button');
    takeOverBtn.className = 'task-discovery-item-btn';
    takeOverBtn.type = 'button';
    takeOverBtn.textContent = 'Take over';
    takeOverBtn.disabled = !selectedTaskSession;
    takeOverBtn.addEventListener('click', async () => {
      takeOverBtn.disabled = true;
      try {
        const taskDocument = await window.calder.task.read(projectPath, task.path);
        const result = await sendProjectBackgroundTaskToSelectedSession(projectId, taskDocument);
        if (!result.ok) {
          status.textContent = result.error ?? 'Unable to send queued task.';
          return;
        }
        args.onCloseModalWide();
      } finally {
        takeOverBtn.disabled = !selectedTaskSession;
      }
    });
    itemActions.appendChild(takeOverBtn);

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'task-discovery-item-btn';
    resumeBtn.type = 'button';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', async () => {
      resumeBtn.disabled = true;
      try {
        const taskDocument = await window.calder.task.read(projectPath, task.path);
        const result = resumeProjectBackgroundTaskInNewSession(projectId, taskDocument);
        if (!result.ok) {
          status.textContent = result.error ?? 'Unable to resume task.';
          return;
        }
        args.onCloseModalWide();
      } finally {
        resumeBtn.disabled = false;
      }
    });
    itemActions.appendChild(resumeBtn);

    const previewBtn = document.createElement('button');
    previewBtn.className = 'task-discovery-item-btn';
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => {
      appState.addFileReaderSession(project.id, task.path);
      args.onCloseModalWide();
    });
    itemActions.appendChild(previewBtn);

    if (task.artifactCount > 0 || task.handoffSummary) {
      const artifactsBtn = document.createElement('button');
      artifactsBtn.className = 'task-discovery-item-btn';
      artifactsBtn.type = 'button';
      artifactsBtn.textContent = 'Artifacts';
      artifactsBtn.addEventListener('click', async () => {
        artifactsBtn.disabled = true;
        try {
          const taskDocument = await window.calder.task.read(project.path, task.path);
          showBackgroundTaskDetails(taskDocument);
        } finally {
          artifactsBtn.disabled = false;
        }
      });
      itemActions.appendChild(artifactsBtn);
    }

    const relativePath = toProjectRelativeContextPath(project.path, task.path);
    if (relativePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'task-discovery-item-btn';
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
    meta.className = 'task-discovery-item-meta';
    const artifactLabel = task.artifactCount === 1 ? '1 artifact' : `${task.artifactCount} artifacts`;
    meta.textContent = task.summary ? `${task.status} · ${artifactLabel} · ${task.summary}` : `${task.status} · ${artifactLabel}`;
    item.appendChild(meta);

    if (task.handoffSummary) {
      const handoff = document.createElement('div');
      handoff.className = 'task-discovery-item-meta';
      handoff.textContent = `Handoff: ${task.handoffSummary}`;
      item.appendChild(handoff);
    }

    list.appendChild(item);
  }

  shell.appendChild(list);
}
