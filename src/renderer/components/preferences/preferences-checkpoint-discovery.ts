import type { ProjectCheckpointDocument } from '../../../shared/types/project-checkpoint.js';
import type { ProjectRecord } from '../../../shared/types/project-state.js';
import { toProjectRelativeContextPath } from '../../project-context-utils.js';
import { appState } from '../../state.js';
import { setModalError, showModal } from '../modal.js';

export interface RenderProjectCheckpointSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onCloseModalWide: () => void;
  onRefreshProviders: () => void;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  modalBody: HTMLElement;
  registerModalCleanup: (cleanup: () => void) => void;
  buildCheckpointRestoreConfirm: (
    projectId: string,
    projectPath: string,
    checkpointDocument: ProjectCheckpointDocument,
    restoreSummaryText: string,
  ) => HTMLElement;
}

type ProjectCheckpointState = NonNullable<ProjectRecord['projectCheckpoints']>;
type ProjectCheckpointEntry = ProjectCheckpointState['checkpoints'][number];

function appendCheckpointEmpty(shell: HTMLElement, text: string): void {
  const empty = document.createElement('div');
  empty.className = 'checkpoint-discovery-empty';
  empty.textContent = text;
  shell.appendChild(empty);
}

function buildCheckpointSnapshot(project: ProjectRecord, label: string) {
  return {
    label,
    projectName: project.name,
    activeSessionId: project.activeSessionId,
    sessions: project.sessions.map((session) => ({
      id: session.id,
      name: session.name,
      type: session.type,
      providerId: session.providerId,
      args: session.args,
      cliSessionId: session.cliSessionId,
      browserTabUrl: session.browserTabUrl,
      browserTargetSessionId: session.browserTargetSessionId,
      diffFilePath: session.diffFilePath,
      diffArea: session.diffArea,
      worktreePath: session.worktreePath,
      fileReaderPath: session.fileReaderPath,
      fileReaderLine: session.fileReaderLine,
    })),
    surface: project.surface
      ? {
          kind: project.surface.kind,
          active: project.surface.active,
          targetSessionId: project.surface.targetSessionId,
          webUrl: project.surface.web?.url,
          webSessionId: project.surface.web?.sessionId,
          cliSelectedProfileId: project.surface.cli?.selectedProfileId,
          cliStatus: project.surface.cli?.runtime?.status,
        }
      : undefined,
    projectContext: project.projectContext
      ? {
          sharedRuleCount: project.projectContext.sharedRuleCount,
          providerSourceCount: project.projectContext.providerSourceCount,
        }
      : undefined,
    projectWorkflows: project.projectWorkflows
      ? {
          workflowCount: project.projectWorkflows.workflows.length,
        }
      : undefined,
    projectTeamContext: project.projectTeamContext
      ? {
          spaceCount: project.projectTeamContext.spaces.length,
          sharedRuleCount: project.projectTeamContext.sharedRuleCount,
          workflowCount: project.projectTeamContext.workflowCount,
        }
      : undefined,
  };
}

function createCheckpointActionBar(args: RenderProjectCheckpointSectionArgs, project: ProjectRecord): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'checkpoint-discovery-actions';

  const createBtn = document.createElement('button');
  createBtn.className = 'checkpoint-discovery-action-btn';
  createBtn.type = 'button';
  createBtn.textContent = 'Create checkpoint';
  createBtn.addEventListener('click', () => {
    showModal('New Checkpoint', [
      {
        label: 'Checkpoint label',
        id: 'checkpoint-label',
        placeholder: 'Before risky refactor',
        defaultValue: 'Manual checkpoint',
      },
    ], async (values) => {
      const label = values['checkpoint-label']?.trim() ?? '';
      if (!label) {
        setModalError('checkpoint-label', 'Checkpoint label is required');
        return;
      }

      const snapshot = buildCheckpointSnapshot(project, label);
      const result = await window.calder.checkpoint.create(project.path, snapshot);
      appState.setProjectCheckpoints(project.id, result.state);
      args.onCloseModalWide();
      args.onRefreshProviders();
    });
  });
  actions.appendChild(createBtn);
  return actions;
}

function createCheckpointSummary(projectCheckpoints: ProjectCheckpointState): HTMLElement {
  const latest = projectCheckpoints.checkpoints[0];
  const summary = document.createElement('div');
  summary.className = 'checkpoint-discovery-summary';
  summary.innerHTML = `
      <div class="checkpoint-discovery-stat">
        <span class="checkpoint-discovery-stat-label">Saved</span>
        <span class="checkpoint-discovery-stat-value">${projectCheckpoints.checkpoints.length}</span>
      </div>
      <div class="checkpoint-discovery-stat">
        <span class="checkpoint-discovery-stat-label">Latest</span>
        <span class="checkpoint-discovery-stat-value">${latest?.label ?? '—'}</span>
      </div>
      <div class="checkpoint-discovery-stat">
        <span class="checkpoint-discovery-stat-label">Changed files</span>
        <span class="checkpoint-discovery-stat-value">${latest?.changedFileCount ?? 0}</span>
      </div>
    `;
  return summary;
}

function registerRestoreModalCleanup(args: RenderProjectCheckpointSectionArgs): void {
  const previousConfirmText = args.confirmButton.textContent;
  const previousCancelText = args.cancelButton.textContent;
  args.confirmButton.textContent = 'Restore';
  args.cancelButton.textContent = 'Cancel';

  args.registerModalCleanup(() => {
    args.confirmButton.textContent = previousConfirmText;
    args.cancelButton.textContent = previousCancelText;
    args.confirmButton.disabled = false;
    args.cancelButton.disabled = false;
  });
}

function openCheckpointRestoreModal(
  args: RenderProjectCheckpointSectionArgs,
  project: ProjectRecord,
  checkpoint: ProjectCheckpointEntry,
  checkpointDocument: ProjectCheckpointDocument,
): void {
  showModal('Restore Checkpoint', [
    {
      label: 'Restore mode',
      id: 'checkpoint-restore-mode',
      type: 'select',
      defaultValue: 'additive',
      options: [
        { value: 'additive', label: 'Keep current layout (additive)' },
        { value: 'replace', label: 'Replace current layout' },
      ],
    },
  ], async (values) => {
    const restoreMode = values['checkpoint-restore-mode'] === 'replace' ? 'replace' : 'additive';
    args.confirmButton.disabled = true;
    args.cancelButton.disabled = true;
    try {
      appState.restoreProjectCheckpoint(project.id, checkpointDocument, restoreMode);
      args.onCloseModalWide();
    } finally {
      args.confirmButton.disabled = false;
      args.cancelButton.disabled = false;
    }
  });

  registerRestoreModalCleanup(args);
  args.modalBody.appendChild(
    args.buildCheckpointRestoreConfirm(project.id, project.path, checkpointDocument, checkpoint.restoreSummary),
  );
  requestAnimationFrame(() => args.confirmButton.focus());
}

function appendPreviewAction(
  args: RenderProjectCheckpointSectionArgs,
  project: ProjectRecord,
  checkpoint: ProjectCheckpointEntry,
  itemActions: HTMLElement,
): void {
  const previewBtn = document.createElement('button');
  previewBtn.className = 'checkpoint-discovery-item-btn';
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview';
  previewBtn.addEventListener('click', () => {
    appState.addFileReaderSession(project.id, checkpoint.path);
    args.onCloseModalWide();
  });
  itemActions.appendChild(previewBtn);
}

function appendOpenAction(project: ProjectRecord, checkpoint: ProjectCheckpointEntry, itemActions: HTMLElement): void {
  const relativePath = toProjectRelativeContextPath(project.path, checkpoint.path);
  if (!relativePath) {
    return;
  }

  const openBtn = document.createElement('button');
  openBtn.className = 'checkpoint-discovery-item-btn';
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

function appendRestoreAction(
  args: RenderProjectCheckpointSectionArgs,
  project: ProjectRecord,
  checkpoint: ProjectCheckpointEntry,
  itemActions: HTMLElement,
): void {
  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'checkpoint-discovery-item-btn';
  restoreBtn.type = 'button';
  restoreBtn.textContent = 'Restore';
  restoreBtn.addEventListener('click', async () => {
    restoreBtn.disabled = true;
    try {
      const checkpointDocument = await window.calder.checkpoint.read(project.path, checkpoint.path);
      openCheckpointRestoreModal(args, project, checkpoint, checkpointDocument);
    } finally {
      restoreBtn.disabled = false;
    }
  });
  itemActions.appendChild(restoreBtn);
}

function appendCheckpointStatus(checkpoint: ProjectCheckpointEntry, itemActions: HTMLElement): void {
  const status = document.createElement('div');
  status.className = 'checkpoint-discovery-item-status';
  status.textContent = `${checkpoint.sessionCount} session${checkpoint.sessionCount === 1 ? '' : 's'} · ${checkpoint.changedFileCount} changed file${checkpoint.changedFileCount === 1 ? '' : 's'}`;
  itemActions.appendChild(status);
}

function createCheckpointItem(
  args: RenderProjectCheckpointSectionArgs,
  project: ProjectRecord,
  checkpoint: ProjectCheckpointEntry,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'checkpoint-discovery-item';

  const header = document.createElement('div');
  header.className = 'checkpoint-discovery-item-header';

  const title = document.createElement('div');
  title.className = 'checkpoint-discovery-item-title';
  title.textContent = checkpoint.label;
  header.appendChild(title);

  const itemActions = document.createElement('div');
  itemActions.className = 'checkpoint-discovery-item-actions';
  appendPreviewAction(args, project, checkpoint, itemActions);
  appendOpenAction(project, checkpoint, itemActions);
  appendRestoreAction(args, project, checkpoint, itemActions);
  appendCheckpointStatus(checkpoint, itemActions);

  header.appendChild(itemActions);
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'checkpoint-discovery-item-meta';
  meta.textContent = `${checkpoint.displayName} · ${new Date(checkpoint.createdAt).toLocaleString()}`;
  item.appendChild(meta);

  const restoreSummary = document.createElement('div');
  restoreSummary.className = 'checkpoint-discovery-item-restore-summary';
  restoreSummary.textContent = checkpoint.restoreSummary;
  item.appendChild(restoreSummary);

  return item;
}

function createCheckpointList(
  args: RenderProjectCheckpointSectionArgs,
  project: ProjectRecord,
  projectCheckpoints: ProjectCheckpointState,
): HTMLElement {
  const list = document.createElement('div');
  list.className = 'checkpoint-discovery-list';
  for (const checkpoint of projectCheckpoints.checkpoints.slice(0, 6)) {
    list.appendChild(createCheckpointItem(args, project, checkpoint));
  }
  return list;
}

export function renderProjectCheckpointSection(args: RenderProjectCheckpointSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Recovery checkpoints',
    'Capture a safe working point with the current sessions, stage surface, git diff summary, and active project context so a risky turn is easier to unwind.',
  );

  const shell = document.createElement('div');
  shell.className = 'checkpoint-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    appendCheckpointEmpty(shell, 'Open a project to capture and manage recovery checkpoints.');
    return;
  }
  const project = args.project;

  shell.appendChild(createCheckpointActionBar(args, project));

  const projectCheckpoints = project.projectCheckpoints;
  if (!projectCheckpoints || projectCheckpoints.checkpoints.length === 0) {
    appendCheckpointEmpty(shell, 'No recovery checkpoints have been saved for this repo yet.');
    return;
  }

  shell.appendChild(createCheckpointSummary(projectCheckpoints));
  shell.appendChild(createCheckpointList(args, project, projectCheckpoints));
}
