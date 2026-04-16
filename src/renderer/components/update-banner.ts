import { getUpdateCenterState, onUpdateCenterChange } from '../update-center.js';

export function initUpdateBanner(): void {
  const mainArea = document.getElementById('main-area');
  if (!mainArea) return;

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'calder-inline-notice hidden';
  mainArea.prepend(banner);

  const copy = document.createElement('div');
  copy.className = 'update-banner-copy';
  banner.appendChild(copy);

  const messageSpan = document.createElement('span');
  messageSpan.className = 'update-banner-message';
  copy.appendChild(messageSpan);

  const actions = document.createElement('div');
  actions.className = 'update-banner-actions hidden';
  banner.appendChild(actions);

  const actionBtn = document.createElement('button');
  actionBtn.className = 'update-banner-btn hidden';
  actions.appendChild(actionBtn);

  let autoHideTimer: number | null = null;

  function clearAutoHideTimer(): void {
    if (autoHideTimer === null) return;
    window.clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  function show(msg: string, btn?: { label: string; action: () => void }, autoHideMs?: number): void {
    clearAutoHideTimer();
    messageSpan.textContent = msg;
    banner.classList.remove('hidden');

    if (btn) {
      actionBtn.textContent = btn.label;
      actionBtn.onclick = btn.action;
      actionBtn.classList.remove('hidden');
      actions.classList.remove('hidden');
    } else {
      actionBtn.classList.add('hidden');
      actionBtn.onclick = null;
      actions.classList.add('hidden');
    }

    if (autoHideMs) {
      autoHideTimer = window.setTimeout(() => {
        autoHideTimer = null;
        banner.classList.add('hidden');
      }, autoHideMs);
    }
  }

  let previousPhase = getUpdateCenterState().app.phase;

  const render = (appUpdateState: ReturnType<typeof getUpdateCenterState>['app']) => {
    const targetLabel = appUpdateState.targetVersion ? `v${appUpdateState.targetVersion}` : 'update';

    if (appUpdateState.phase === 'downloading') {
      const percent = typeof appUpdateState.downloadPercent === 'number'
        ? ` ${appUpdateState.downloadPercent}%`
        : '';
      show(`Downloading ${targetLabel}...${percent}`);
    } else if (appUpdateState.phase === 'ready_to_restart') {
      show(`Update ${targetLabel} ready.`, {
        label: 'Restart',
        action: () => {
          void window.calder.update.install();
        },
      });
    } else if (
      appUpdateState.phase === 'up_to_date'
      && (previousPhase === 'checking' || previousPhase === 'downloading')
    ) {
      show('You’re up to date.', undefined, 3600);
    } else if (
      appUpdateState.phase === 'error'
      && (previousPhase === 'checking' || previousPhase === 'downloading')
    ) {
      show(appUpdateState.errorMessage ? `Update failed: ${appUpdateState.errorMessage}` : 'Update check failed.', undefined, 7000);
    }

    previousPhase = appUpdateState.phase;
  };

  render(getUpdateCenterState().app);
  const unsubscribe = onUpdateCenterChange((snapshot) => {
    render(snapshot.app);
  });
  window.addEventListener('beforeunload', () => {
    clearAutoHideTimer();
    unsubscribe();
  }, { once: true });
}
