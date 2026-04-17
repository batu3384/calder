import type { CliSurfaceDiscoveryCandidate } from '../../../shared/types.js';

interface QuickSetupHandlers {
  onRun: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onEdit: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onManual: () => void;
}

function createQuickSetupButton(
  label: string,
  options?: { primary?: boolean; action?: string; tone?: 'neutral' | 'ghost' },
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options?.primary
    ? 'modal-btn primary cli-surface-quick-setup-btn cli-surface-quick-setup-btn-primary'
    : `modal-btn cli-surface-quick-setup-btn ${
      options?.tone === 'ghost'
        ? 'cli-surface-quick-setup-btn-ghost'
        : 'cli-surface-quick-setup-btn-neutral'
    }`;
  button.classList.add('cli-surface-quick-setup-control');
  button.textContent = label;
  button.setAttribute('aria-label', label);
  if (options?.action) {
    button.dataset.action = options.action;
  }
  return button;
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
  elements.modal.classList.add('cli-surface-quick-setup-modal');
  elements.modal.setAttribute('role', 'dialog');
  elements.modal.setAttribute('aria-modal', 'true');
  elements.modal.setAttribute('aria-labelledby', 'modal-title');
  elements.overlay.classList.remove('hidden');
  return elements;
}

function hideQuickSetupModal(): void {
  const { overlay, modal, body, actions } = getModalElements();
  overlay.classList.add('hidden');
  modal.classList.remove('modal-surface');
  modal.classList.remove('cli-surface-quick-setup-modal');
  body.classList.remove('cli-surface-quick-setup-body');
  actions.classList.remove('cli-surface-quick-setup-footer');
}

export function showCliSurfaceQuickSetup(
  candidates: CliSurfaceDiscoveryCandidate[],
  handlers: QuickSetupHandlers,
): void {
  const { title: titleEl, body: bodyEl, actions: actionsEl } = openQuickSetupModal();
  titleEl.textContent = 'CLI Surface Suggestions';
  bodyEl.innerHTML = '';
  actionsEl.innerHTML = '';
  bodyEl.classList.add('cli-surface-quick-setup-body');
  actionsEl.classList.add('cli-surface-quick-setup-footer');

  if (candidates.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'cli-surface-quick-setup-empty';
    emptyState.innerHTML = `
      <strong>No launch command detected yet.</strong>
      <p>Set up your own CLI command manually to continue.</p>
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

      const runButton = createQuickSetupButton('Run', { primary: true, action: 'run' });
      runButton.dataset.candidateId = candidate.id;
      runButton.classList.add('cli-surface-quick-setup-card-btn');

      const editButton = createQuickSetupButton('Edit', { action: 'edit' });
      editButton.dataset.candidateId = candidate.id;
      editButton.classList.add('cli-surface-quick-setup-card-btn');

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

  const footerLeft = document.createElement('div');
  footerLeft.className = 'cli-surface-quick-setup-footer-group';

  const footerRight = document.createElement('div');
  footerRight.className = 'cli-surface-quick-setup-footer-group';

  const cancelButton = createQuickSetupButton('Cancel', { tone: 'ghost', action: 'cancel' });
  cancelButton.classList.add('cli-surface-quick-setup-footer-btn');
  cancelButton.addEventListener('click', () => {
    hideQuickSetupModal();
  });
  footerLeft.appendChild(cancelButton);

  const manualButton = createQuickSetupButton('Manual setup', { action: 'manual-setup', tone: 'neutral' });
  manualButton.classList.add('cli-surface-quick-setup-footer-btn');
  manualButton.addEventListener('click', () => {
    hideQuickSetupModal();
    handlers.onManual();
  });
  footerRight.appendChild(manualButton);

  actionsEl.appendChild(footerLeft);
  actionsEl.appendChild(footerRight);
}
