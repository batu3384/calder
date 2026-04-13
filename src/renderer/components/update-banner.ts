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

  function show(msg: string, btn?: { label: string; action: () => void }, autoHideMs?: number): void {
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
      setTimeout(() => banner.classList.add('hidden'), autoHideMs);
    }
  }

  let latestVersion = '';

  window.calder.update.onAvailable((info) => {
    latestVersion = info.version;
    show(`Downloading update v${info.version}...`);
  });

  window.calder.update.onDownloadProgress((info) => {
    const label = latestVersion ? `v${latestVersion}` : 'update';
    show(`Downloading ${label}... ${info.percent}%`);
  });

  window.calder.update.onDownloaded((info) => {
    show(`Update v${info.version} ready.`, {
      label: 'Restart',
      action: () => window.calder.update.install(),
    });
  });

  window.calder.update.onError(() => {
    // Silently ignore update failures
  });
}
