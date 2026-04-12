import type { CliSurfaceDiscoveryCandidate } from '../../../shared/types.js';

interface QuickSetupHandlers {
  onRun: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onEdit: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onManual: () => void;
}

function formatCommand(candidate: CliSurfaceDiscoveryCandidate): string {
  return [candidate.command, ...(candidate.args ?? [])].join(' ');
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

  for (const candidate of candidates) {
    const card = document.createElement('div');
    card.className = 'cli-surface-quick-setup-card';
    card.innerHTML = `
      <div class="cli-surface-quick-setup-command">${formatCommand(candidate)}</div>
      <div class="cli-surface-quick-setup-reason">${candidate.reason}</div>
      <div class="cli-surface-quick-setup-cwd">${candidate.cwd ?? ''}</div>
      <div class="cli-surface-quick-setup-actions">
        <button type="button" data-action="run" data-candidate-id="${candidate.id}">Run</button>
        <button type="button" data-action="edit" data-candidate-id="${candidate.id}">Edit</button>
      </div>
    `;
    bodyEl.appendChild(card);
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
