interface ShowSpawnFailureOverlayParams {
  element: HTMLDivElement;
  sessionId: string;
  details: string;
  onRetry: (sessionId: string) => Promise<void> | void;
}

export function formatSpawnFailureMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }
  return 'The CLI process could not start. Check provider installation and settings, then retry.';
}

export function clearSpawnFailureOverlay(element: HTMLDivElement): void {
  const overlay = element.querySelector('.terminal-exit-overlay');
  if (overlay) {
    overlay.remove();
  }
}

export function showSpawnFailureOverlay(params: ShowSpawnFailureOverlayParams): void {
  const { element, sessionId, details, onRetry } = params;

  clearSpawnFailureOverlay(element);

  const overlay = document.createElement('div');
  overlay.className = 'terminal-exit-overlay';

  const shell = document.createElement('div');
  shell.className = 'terminal-exit-message terminal-exit-shell';

  const kicker = document.createElement('div');
  kicker.className = 'terminal-exit-kicker shell-kicker';
  kicker.textContent = 'Terminal';

  const title = document.createElement('div');
  title.className = 'terminal-exit-title';
  title.textContent = 'Session failed to start';

  const copy = document.createElement('div');
  copy.className = 'terminal-exit-copy';
  copy.textContent = details;

  const respawnButton = document.createElement('button');
  respawnButton.className = 'respawn-btn calder-button';
  respawnButton.textContent = 'Retry Session';
  respawnButton.addEventListener('click', () => {
    overlay.remove();
    void onRetry(sessionId);
  });

  shell.appendChild(kicker);
  shell.appendChild(title);
  shell.appendChild(copy);
  shell.appendChild(respawnButton);
  overlay.appendChild(shell);
  element.appendChild(overlay);
}
