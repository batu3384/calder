import type { ProjectCheckpointDocument } from '../../../shared/types/project-checkpoint.js';
import { appState } from '../../state.js';
import { closeModal } from '../modal.js';

function formatCountLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function resolveProjectFilePath(projectPath: string, filePath: string): string {
  if (!filePath) return projectPath;
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(filePath)) {
    return filePath.replace(/\\/g, '/');
  }
  const normalizedProject = projectPath.replace(/[\\/]+$/, '');
  const normalizedFile = filePath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedProject}/${normalizedFile}`;
}

function appendCheckpointRestoreFact(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement('div');
  row.className = 'checkpoint-restore-confirm-fact';

  const labelEl = document.createElement('div');
  labelEl.className = 'checkpoint-restore-confirm-fact-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'checkpoint-restore-confirm-fact-value';
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  container.appendChild(row);
}

function closeWideModal(): void {
  closeModal();
  const modal = document.getElementById('modal');
  modal?.classList.remove('modal-wide');
}

export function buildCheckpointRestoreConfirm(
  projectId: string,
  projectPath: string,
  checkpointDocument: ProjectCheckpointDocument,
  restoreSummaryText: string,
): HTMLElement {
  const sessionKinds = checkpointDocument.sessions.reduce((counts, session) => {
    const type = session.type ?? 'claude';
    counts.set(type, (counts.get(type) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const sessionParts = [
    sessionKinds.get('claude') ? formatCountLabel(sessionKinds.get('claude')!, 'CLI session', 'CLI sessions') : null,
    sessionKinds.get('browser-tab') ? formatCountLabel(sessionKinds.get('browser-tab')!, 'browser surface', 'browser surfaces') : null,
    sessionKinds.get('file-reader') ? formatCountLabel(sessionKinds.get('file-reader')!, 'file view', 'file views') : null,
    sessionKinds.get('diff-viewer') ? formatCountLabel(sessionKinds.get('diff-viewer')!, 'diff view', 'diff views') : null,
    sessionKinds.get('remote-terminal') ? formatCountLabel(sessionKinds.get('remote-terminal')!, 'remote session', 'remote sessions') : null,
    sessionKinds.get('mcp-inspector') ? formatCountLabel(sessionKinds.get('mcp-inspector')!, 'inspector', 'inspectors') : null,
  ].filter((entry): entry is string => Boolean(entry));

  const gitSummary = checkpointDocument.git.isGitRepo
    ? [
        checkpointDocument.git.branch ?? 'Detached HEAD',
        formatCountLabel(checkpointDocument.changedFileCount, 'changed file', 'changed files'),
      ].join(' · ')
    : 'Git metadata unavailable';

  const surfaceSummary = checkpointDocument.surface
    ? checkpointDocument.surface.kind === 'web'
      ? `Live View${checkpointDocument.surface.webUrl ? ` · ${checkpointDocument.surface.webUrl}` : ''}`
      : `CLI Surface${checkpointDocument.surface.cliStatus ? ` · ${checkpointDocument.surface.cliStatus}` : ''}`
    : 'No focused surface snapshot';

  const contextSummary = checkpointDocument.projectContext
    ? [
        formatCountLabel(checkpointDocument.projectContext.sharedRuleCount, 'shared rule', 'shared rules'),
        formatCountLabel(checkpointDocument.projectContext.providerSourceCount, 'provider source', 'provider sources'),
      ].join(' · ')
    : 'No shared project context snapshot';

  const workflowSummary = checkpointDocument.projectWorkflows
    ? formatCountLabel(checkpointDocument.projectWorkflows.workflowCount, 'workflow', 'workflows')
    : 'No workflow snapshot';

  const teamContextSummary = checkpointDocument.projectTeamContext
    ? [
        formatCountLabel(checkpointDocument.projectTeamContext.spaceCount, 'shared space', 'shared spaces'),
        formatCountLabel(checkpointDocument.projectTeamContext.sharedRuleCount, 'shared rule', 'shared rules'),
        formatCountLabel(checkpointDocument.projectTeamContext.workflowCount, 'workflow', 'workflows'),
      ].join(' · ')
    : 'No team context snapshot';

  const confirm = document.createElement('div');
  confirm.className = 'checkpoint-restore-confirm';

  const intro = document.createElement('div');
  intro.className = 'checkpoint-restore-confirm-copy';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'checkpoint-restore-confirm-kicker shell-kicker';
  eyebrow.textContent = 'Checkpoint restore';
  intro.appendChild(eyebrow);

  const title = document.createElement('div');
  title.className = 'checkpoint-restore-confirm-title';
  title.textContent = checkpointDocument.label;
  intro.appendChild(title);

  const description = document.createElement('div');
  description.className = 'checkpoint-restore-confirm-description';
  description.textContent = restoreSummaryText;
  intro.appendChild(description);
  confirm.appendChild(intro);

  const stats = document.createElement('div');
  stats.className = 'checkpoint-restore-confirm-stats';
  for (const stat of [
    { label: 'Saved', value: new Date(checkpointDocument.createdAt).toLocaleString() },
    { label: 'Sessions', value: formatCountLabel(checkpointDocument.sessionCount, 'session', 'sessions') },
    { label: 'Changed files', value: String(checkpointDocument.changedFileCount) },
  ]) {
    const statCard = document.createElement('div');
    statCard.className = 'checkpoint-restore-confirm-stat';

    const statLabel = document.createElement('div');
    statLabel.className = 'checkpoint-restore-confirm-stat-label';
    statLabel.textContent = stat.label;

    const statValue = document.createElement('div');
    statValue.className = 'checkpoint-restore-confirm-stat-value';
    statValue.textContent = stat.value;

    statCard.appendChild(statLabel);
    statCard.appendChild(statValue);
    stats.appendChild(statCard);
  }
  confirm.appendChild(stats);

  const facts = document.createElement('div');
  facts.className = 'checkpoint-restore-confirm-facts';
  appendCheckpointRestoreFact(
    facts,
    'Restores',
    sessionParts.length > 0 ? sessionParts.join(', ') : 'Saved session state',
  );
  appendCheckpointRestoreFact(facts, 'Surface', surfaceSummary);
  appendCheckpointRestoreFact(facts, 'Git', gitSummary);
  appendCheckpointRestoreFact(facts, 'Shared context', contextSummary);
  appendCheckpointRestoreFact(facts, 'Team context', teamContextSummary);
  appendCheckpointRestoreFact(facts, 'Workflows', workflowSummary);
  appendCheckpointRestoreFact(
    facts,
    'Restore modes',
    'Additive keeps your current work open. Replace swaps the current layout for this checkpoint.',
  );
  confirm.appendChild(facts);

  if (checkpointDocument.git.changedFiles.length > 0) {
    const changedFiles = checkpointDocument.git.changedFiles.slice(0, 5);
    const fileBlock = document.createElement('div');
    fileBlock.className = 'checkpoint-restore-confirm-file-block';

    const fileTitle = document.createElement('div');
    fileTitle.className = 'checkpoint-restore-confirm-fact-label';
    fileTitle.textContent = 'Changed files snapshot';
    fileBlock.appendChild(fileTitle);

    const fileList = document.createElement('div');
    fileList.className = 'checkpoint-restore-confirm-file-list';

    for (const file of changedFiles) {
      const fileItem = document.createElement('button');
      fileItem.className = 'checkpoint-restore-confirm-file-item';
      fileItem.type = 'button';

      const status = document.createElement('span');
      status.className = 'checkpoint-restore-confirm-file-status';
      status.textContent = `${file.status} · ${file.area}`;

      const filePath = document.createElement('span');
      filePath.className = 'checkpoint-restore-confirm-file-path';
      filePath.textContent = file.path;

      fileItem.addEventListener('click', () => {
        const resolvedPath = resolveProjectFilePath(projectPath, file.path);
        if (file.area === 'untracked') {
          appState.addFileReaderSession(projectId, resolvedPath);
        } else {
          appState.addDiffViewerSession(projectId, resolvedPath, file.area, checkpointDocument.project.path);
        }
        closeWideModal();
      });

      fileItem.appendChild(status);
      fileItem.appendChild(filePath);
      fileList.appendChild(fileItem);
    }

    if (checkpointDocument.git.changedFiles.length > changedFiles.length) {
      const more = document.createElement('div');
      more.className = 'checkpoint-restore-confirm-file-more';
      more.textContent = `+${checkpointDocument.git.changedFiles.length - changedFiles.length} more saved file change${checkpointDocument.git.changedFiles.length - changedFiles.length === 1 ? '' : 's'}`;
      fileList.appendChild(more);
    }

    fileBlock.appendChild(fileList);
    confirm.appendChild(fileBlock);
  }

  return confirm;
}
