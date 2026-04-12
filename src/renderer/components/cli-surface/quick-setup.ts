import type { CliSurfaceDiscoveryCandidate } from '../../../shared/types.js';

interface QuickSetupHandlers {
  onRun: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onEdit: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onDemo: () => void;
  onManual: () => void;
}

function formatCommand(candidate: CliSurfaceDiscoveryCandidate): string {
  return [candidate.command, ...(candidate.args ?? [])].join(' ');
}

function getWorkspaceLabel(candidates: CliSurfaceDiscoveryCandidate[]): string {
  const families = new Set(
    candidates.map((candidate) => candidate.id.split(':')[0]).filter(Boolean),
  );

  if (families.size !== 1) {
    return 'Mixed workspace';
  }

  const [family] = [...families];
  switch (family) {
    case 'node':
      return 'Node workspace';
    case 'python':
      return 'Python workspace';
    case 'cargo':
      return 'Rust workspace';
    case 'go':
      return 'Go workspace';
    default:
      return 'CLI workspace';
  }
}

function getModalElements() {
  const overlay = document.getElementById('modal-overlay') as HTMLDivElement | null;
  const modal = document.getElementById('modal') as HTMLDivElement | null;
  const title = document.getElementById('modal-title') as HTMLDivElement | null;
  const body = document.getElementById('modal-body') as HTMLDivElement | null;
  const actions = document.getElementById('modal-actions') as HTMLDivElement | null;
  if (!overlay || !modal || !title || !body || !actions) {
    throw new Error('Quick setup modal scaffold is missing');
  }
  return { overlay, modal, title, body, actions };
}

function openQuickSetupModal() {
  const elements = getModalElements();
  elements.modal.classList.add('modal-surface');
  elements.modal.setAttribute('role', 'dialog');
  elements.modal.setAttribute('aria-modal', 'true');
  elements.modal.setAttribute('aria-labelledby', 'modal-title');
  elements.overlay.classList.remove('hidden');
  return elements;
}

function hideQuickSetupModal(): void {
  const { overlay, modal } = getModalElements();
  overlay.classList.add('hidden');
  modal.classList.remove('modal-surface');
}

export function showCliSurfaceQuickSetup(
  candidates: CliSurfaceDiscoveryCandidate[],
  handlers: QuickSetupHandlers,
): void {
  const { title: titleEl, body: bodyEl, actions: actionsEl } = openQuickSetupModal();
  titleEl.textContent = 'CLI Surface Suggestions';
  bodyEl.innerHTML = '';
  actionsEl.innerHTML = '';

  if (candidates.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'cli-surface-quick-setup-empty';
    emptyState.innerHTML = `
      <strong>No launch command detected yet.</strong>
      <p>Try Calder's built-in demo to preview the workflow, or set up your own CLI command manually.</p>
    `;
    bodyEl.appendChild(emptyState);
  } else {
    const summary = document.createElement('div');
    summary.className = 'cli-surface-quick-setup-summary';
    const summaryKicker = document.createElement('div');
    summaryKicker.className = 'cli-surface-quick-setup-summary-kicker';
    summaryKicker.textContent = getWorkspaceLabel(candidates);

    const summaryTitle = document.createElement('strong');
    summaryTitle.textContent = 'Best match';

    const summaryPreview = document.createElement('div');
    summaryPreview.className = 'cli-surface-quick-setup-summary-preview';
    summaryPreview.textContent = formatCommand(candidates[0]);

    const summaryCopy = document.createElement('p');
    summaryCopy.textContent = `Calder found ${candidates.length} runnable option${candidates.length === 1 ? '' : 's'} for this project.`;

    summary.appendChild(summaryKicker);
    summary.appendChild(summaryTitle);
    summary.appendChild(summaryPreview);
    summary.appendChild(summaryCopy);
    bodyEl.appendChild(summary);

    for (const candidate of candidates) {
      const card = document.createElement('div');
      card.className = 'cli-surface-quick-setup-card';

      const command = document.createElement('div');
      command.className = 'cli-surface-quick-setup-command';
      command.textContent = formatCommand(candidate);

      const reason = document.createElement('div');
      reason.className = 'cli-surface-quick-setup-reason';
      reason.textContent = candidate.reason;

      const cwd = document.createElement('div');
      cwd.className = 'cli-surface-quick-setup-cwd';
      cwd.textContent = candidate.cwd ?? '';

      const cardActions = document.createElement('div');
      cardActions.className = 'cli-surface-quick-setup-actions';

      const runButton = document.createElement('button');
      runButton.type = 'button';
      runButton.dataset.action = 'run';
      runButton.dataset.candidateId = candidate.id;
      runButton.textContent = 'Run';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.dataset.action = 'edit';
      editButton.dataset.candidateId = candidate.id;
      editButton.textContent = 'Edit';

      cardActions.appendChild(runButton);
      cardActions.appendChild(editButton);
      card.appendChild(command);
      card.appendChild(reason);
      card.appendChild(cwd);
      card.appendChild(cardActions);
      bodyEl.appendChild(card);
    }
  }

  bodyEl.querySelectorAll('[data-action="run"]').forEach((button) => {
    button.addEventListener('click', () => {
      const candidate = candidates.find((entry) => entry.id === (button as HTMLElement).dataset.candidateId)!;
      hideQuickSetupModal();
      handlers.onRun(candidate);
    });
  });

  bodyEl.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const candidate = candidates.find((entry) => entry.id === (button as HTMLElement).dataset.candidateId)!;
      hideQuickSetupModal();
      handlers.onEdit(candidate);
    });
  });

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    hideQuickSetupModal();
  });
  actionsEl.appendChild(cancelButton);

  const demoButton = document.createElement('button');
  demoButton.type = 'button';
  demoButton.dataset.action = 'demo-setup';
  demoButton.textContent = 'Try demo';
  demoButton.addEventListener('click', () => {
    hideQuickSetupModal();
    handlers.onDemo();
  });
  actionsEl.appendChild(demoButton);

  const manualButton = document.createElement('button');
  manualButton.type = 'button';
  manualButton.dataset.action = 'manual-setup';
  manualButton.textContent = 'Manual setup';
  manualButton.addEventListener('click', () => {
    hideQuickSetupModal();
    handlers.onManual();
  });
  actionsEl.appendChild(manualButton);
}
