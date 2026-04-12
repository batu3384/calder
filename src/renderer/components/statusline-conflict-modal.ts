import { escapeHtml } from './dom-search-backend.js';

let cleanupFn: (() => void) | null = null;
let pendingResolve: ((choice: 'replace' | 'keep') => void) | null = null;

function getOverlay(): HTMLElement {
  let overlay = document.getElementById('statusline-conflict-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'statusline-conflict-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="modal-box statusline-conflict-box">
      <div class="modal-title">Use Calder status line?</div>
      <div class="modal-body statusline-conflict-body"></div>
      <div class="modal-actions">
        <button id="statusline-conflict-keep" class="modal-btn">Keep current</button>
        <button id="statusline-conflict-replace" class="modal-btn primary">Use Calder</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function showStatusLineConflictModal(foreignCommand: string): Promise<'replace' | 'keep'> {
  // Resolve any previous pending invocation before re-showing
  if (pendingResolve) {
    pendingResolve('keep');
    pendingResolve = null;
  }
  cleanupFn?.();
  cleanupFn = null;

  const overlay = getOverlay();
  const body = overlay.querySelector('.statusline-conflict-body')!;

  body.innerHTML = `
    <p class="statusline-conflict-text">
      Calder uses a small <strong>status line</strong> command to show session cost and context usage in the app.
    </p>
    <div class="statusline-conflict-command">
      <div class="statusline-conflict-command-label">Current command</div>
      <code>${escapeHtml(foreignCommand)}</code>
    </div>
    <p class="statusline-conflict-text statusline-conflict-warning">
      This tool already has a different status line configured. Keep the current command, or switch to Calder to turn tracking on.
    </p>`;

  overlay.style.display = '';

  return new Promise((resolve) => {
    pendingResolve = resolve;
    const keepBtn = overlay.querySelector('#statusline-conflict-keep') as HTMLButtonElement;
    const replaceBtn = overlay.querySelector('#statusline-conflict-replace') as HTMLButtonElement;

    const close = (choice: 'replace' | 'keep') => {
      overlay.style.display = 'none';
      cleanupFn?.();
      cleanupFn = null;
      pendingResolve = null;
      resolve(choice);
    };

    const handleKeep = () => close('keep');
    const handleReplace = () => close('replace');
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close('keep'); }
    };

    keepBtn.addEventListener('click', handleKeep);
    replaceBtn.addEventListener('click', handleReplace);
    document.addEventListener('keydown', handleKeydown);

    cleanupFn = () => {
      keepBtn.removeEventListener('click', handleKeep);
      replaceBtn.removeEventListener('click', handleReplace);
      document.removeEventListener('keydown', handleKeydown);
    };

    requestAnimationFrame(() => keepBtn.focus());
  });
}
